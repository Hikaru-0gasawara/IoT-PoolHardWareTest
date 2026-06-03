// MqttProvider — fonte única de dados em tempo real do ESP32 (firmware v3.1).
//
// Protocolo PT — assina aquasense-ibmec-pt/# no HiveMQ Cloud (TLS/WSS 8884).
// Schemas aceitam o payload PT do firmware e fazem transform para identificadores
// internos EN (DoseEvent.parameter/event, ControlMode "auto"/etc.) para minimizar
// ripple no resto do código TypeScript.
//
// Conecta ao cluster HiveMQ Cloud (wss://...:8884/mqtt) e parseia o tópico
// consolidado aquasense-ibmec-pt/dados. Empurra cada amostra para o poolStore via
// ingestFromMqtt() — assim toda a UI continua funcionando sem mudanças.
//
// Fallback automático: se ficar 15s sem mensagem real, ativa a simulação local
// (poolStore._start). Quando MQTT volta a publicar, a simulação para e os dados
// reais voltam silenciosamente.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import mqtt from "mqtt";
import type { MqttClient } from "mqtt";
import { z } from "zod";
import {
  type AquaSenseData,
  type DataSource,
  type MqttConnectionStatus,
  type MqttContextValue,
  type MqttLogEntry,
  type WaterStatus,
} from "@/types/firmware";
import type {
  ControlMode,
  ControlStateMessage,
  DoseChemical,
  DoseEvent,
  SystemHealthMessage,
} from "@/types/firmware";
import { usePoolStore } from "@/store/poolStore";
import { MQTT_TOPICS, TOPIC_CONTROL_MODE, TOPIC_DOSING_COMMAND } from "@/lib/mqttTopics";
import {
  type GapDetectorState,
  createGapDetector,
  pushCycle,
  resetBaseline,
} from "@/lib/cycleGaps";

const MQTT_URL      = "wss://5b98faa6560246759f3065ffc720f8b9.s1.eu.hivemq.cloud:8884/mqtt";
const MQTT_USERNAME = "ProjetoIoT";
const MQTT_PASSWORD = "IoT12345678";
const FALLBACK_AFTER_MS = 15_000;
const LOG_MAX = 50;
const DOSING_EVENTS_MAX = 50;

const COMMAND_THROTTLE_MS = 1000;

const noopAsync = async () => {
  throw new Error("MqttProvider não montado");
};

const MqttContext = createContext<MqttContextValue>({
  status: "connecting",
  source: "none",
  lastMessageAt: null,
  cycle: null,
  log: [],
  data: null,
  gaps: [],
  totalGaps: 0,
  messagesReceivedCount: 0,
  providerMountedAt: 0,
  dosingEvents: [],
  controlState: null,
  systemHealth: null,
  publishMode: noopAsync,
  publishDosingCommand: noopAsync,
});

function statusFor(value: number, min: number, max: number): WaterStatus {
  if (value <= -50) return "OK"; // erro de sensor — UI trata separado
  if (value < min) return "BAIXO";
  if (value > max) return "ALTO";
  return "OK";
}

// Validação defensiva — broker público aceita qualquer publisher.
const SENTINEL = -99.0;
const numInRange = (min: number, max: number) =>
  z
    .number()
    .finite()
    .refine((v) => v === SENTINEL || (v >= min && v <= max), {
      message: `fora da faixa [${min}, ${max}]`,
    });

// ─────────────────────────────────────────────────────────────────────
// Enums — wire format PT, traduzidos para identificadores internos EN.
// Uso de transform mantém o resto do código TS inalterado.
// ─────────────────────────────────────────────────────────────────────

// Modo: PT "automatico"|"manual"|"parada" → EN "auto"|"manual"|"estop".
// "estop" é estado interno; firmware PT publica "parada".
const ModeWireEnum = z.enum(["automatico", "manual", "parada"]);
const wireModeToInternal = (m: z.infer<typeof ModeWireEnum>): ControlMode =>
  m === "automatico" ? "auto" : m === "parada" ? "estop" : "manual";
const internalModeToWire = (m: ControlMode): string =>
  m === "auto" ? "automatico" : m === "estop" ? "parada" : "manual";

// Produtos químicos — já em PT em ambos lados.
const DoseChemEnum = z.enum(["cloro", "acido", "base"]);

// Tipo de evento: PT "iniciada"|"concluida"|"bloqueada" → EN "started"|"completed"|"blocked".
const EventWireEnum = z.enum(["iniciada", "concluida", "bloqueada"]);
const wireEventToInternal = (e: z.infer<typeof EventWireEnum>): "started" | "completed" | "blocked" =>
  e === "iniciada" ? "started" : e === "concluida" ? "completed" : "blocked";

// FORK PT (Melhoria 1) — origem do comando para auditoria.
const FonteEnum = z.enum(["automatico", "manual"]);

const StatusEnum = z.enum(["OK", "BAIXO", "ALTO", "ERRO"]);

// ─────────────────────────────────────────────────────────────────────
// Schemas dos 3 tópicos de controle. Wire format PT, transform → EN.
// ─────────────────────────────────────────────────────────────────────

// dosagem/evento — schema PT com novo campo `fonte`.
export const DosingEventSchema = z
  .object({
    parametro: DoseChemEnum,
    evento: EventWireEnum,
    motivo: z.string().max(200).optional(),
    doses_hora: z.number().int().min(0).max(1000).optional(),
    doses_dia: z.number().int().min(0).max(1000).optional(),
    fonte: FonteEnum.optional(),
  })
  .passthrough();

// controle/estado (retain) — schema PT com transform.
export const ControlStateSchema = z
  .object({
    modo: ModeWireEnum,
    parada_emergencia: z.boolean(),
    dose_em_andamento: DoseChemEnum.nullable(),
  })
  .passthrough();

// sistema/saude — telemetria 60s. Todos campos opcionais.
const DosesTodaySchema = z.object({
  cloro: z.number().int().min(0).max(1000),
  acido: z.number().int().min(0).max(1000),
  base: z.number().int().min(0).max(1000),
});

export const SystemHealthSchema = z
  .object({
    tempo_ativo_s: z.number().int().min(0).max(10_000_000).optional(),
    heap_livre_kb: z.number().int().min(0).max(10_000).optional(),
    rssi_wifi_dbm: z.number().finite().min(-120).max(0).optional(),
    erros_dht: z.number().int().min(0).max(1_000_000).optional(),
    erros_ds: z.number().int().min(0).max(1_000_000).optional(),
    falhas_mqtt: z.number().int().min(0).max(1_000_000).optional(),
    doses_hoje: DosesTodaySchema.optional(),
  })
  .passthrough();

// ─────────────────────────────────────────────────────────────────────
// Payload consolidado (`dados`) — flat PT do firmware main_pt.py.
// ─────────────────────────────────────────────────────────────────────

const FlatPayloadPtSchema = z
  .object({
    ph: numInRange(0, 14),
    orp_mv: z.number().finite().min(-2000).max(2000).optional(),
    cloro: numInRange(0, 20),
    alcalinidade: numInRange(0, 500),
    temp_piscina: numInRange(-10, 100),
    temp_coletor: numInRange(-10, 150).optional(),
    delta_t: z.number().finite().min(-100).max(100).optional(),
    umidade: z.number().finite().min(-1).max(100).optional(),
    bomba: z.union([z.enum(["LIGADA", "DESLIGADA"]), z.boolean()]),
    alertas: z.array(z.string().max(200)).max(20).optional(),
    ciclo: z.number().int().min(0).max(10_000_000).optional(),
    modo: ModeWireEnum.optional(),
    parada_emergencia: z.boolean().optional(),
    dose_em_andamento: DoseChemEnum.nullable().optional(),
  })
  .passthrough();

// O firmware PT (main_pt.py) publica JSON flat em aquasense-ibmec-pt/dados.
function parseConsolidated(raw: string): AquaSenseData | null {
  try {
    if (raw.length > 8192) return null;
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== "object") return null;

    if (typeof obj.ph !== "number" || typeof obj.temp_piscina !== "number") return null;

    const flat = FlatPayloadPtSchema.safeParse(obj);
    if (!flat.success) {
      console.warn("[MQTT] payload PT rejeitado:", flat.error.issues[0]?.message);
      return null;
    }
    const f = flat.data;
    const ph = f.ph;
    const cloro = f.cloro;
    const alk = f.alcalinidade;
    const orp = f.orp_mv ?? 0;
    const tPool = f.temp_piscina;
    const tSolar = f.temp_coletor ?? -99;
    const dT = f.delta_t ?? tSolar - tPool;
    const hum = f.umidade ?? -1;
    const pumpOn = f.bomba === "LIGADA" || f.bomba === true;
    const alerts = (f.alertas ?? []).slice(0, 20);

    return {
      projeto: "AquaSense IoT",
      ciclo: f.ciclo ?? 0,
      qualidade_agua: {
        ph,
        ph_status: statusFor(ph, 7.2, 7.6),
        cloro_ppm: cloro,
        cloro_status: statusFor(cloro, 1.0, 3.0),
        orp_mv: orp,
        alcalinidade_ppm: alk,
        alcalinidade_status: statusFor(alk, 80, 120),
      },
      temperaturas: {
        piscina_C: tPool,
        coletor_solar_C: tSolar,
        delta_T: Math.round(dT * 10) / 10,
        umidade_pct: hum,
      },
      controle: {
        bomba: pumpOn ? "LIGADA" : "DESLIGADA",
        led_status: alerts.length === 0 ? "ACESO" : "APAGADO",
      },
      alertas: alerts,
      // Internals EN — traduzidos a partir do wire PT.
      mode: f.modo ? wireModeToInternal(f.modo) : undefined,
      estop: f.parada_emergencia,
      dose_in_progress: f.dose_em_andamento,
    };
  } catch {
    return null;
  }
}

export function MqttProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<MqttConnectionStatus>("connecting");
  const [source, setSource] = useState<DataSource>("none");
  const [lastMessageAt, setLastMessageAt] = useState<number | null>(null);
  const [cycle, setCycle] = useState<number | null>(null);
  const [data, setData] = useState<AquaSenseData | null>(null);
  const [log, setLog] = useState<MqttLogEntry[]>([]);
  const [gapState, setGapState] = useState<GapDetectorState>(() => createGapDetector());
  const [messagesReceivedCount, setMessagesReceivedCount] = useState(0);
  const [providerMountedAt] = useState(() => Date.now());
  const [dosingEvents, setDosingEvents] = useState<DoseEvent[]>([]);
  const [controlState, setControlState] = useState<ControlStateMessage | null>(null);
  const [systemHealth, setSystemHealth] = useState<SystemHealthMessage | null>(null);
  const sourceRef = useRef<DataSource>("none");

  const clientRef = useRef<MqttClient | null>(null);
  const watchdogRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastRealAtRef = useRef<number>(0);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const clientId = "aquasense-dashboard-pt-" + Math.random().toString(16).slice(2, 10);
    const client = mqtt.connect(MQTT_URL, {
      clientId,
      clean: true,
      reconnectPeriod: 4000,
      connectTimeout: 10_000,
      username: MQTT_USERNAME,
      password: MQTT_PASSWORD,
    });
    clientRef.current = client;

    client.on("connect", () => {
      setStatus("connected");
      client.subscribe(MQTT_TOPICS.ALL, { qos: 0 }, (err) => {
        if (err) console.error("[MQTT] subscribe failed:", err);
        else console.log(`[MQTT] subscribed to ${MQTT_TOPICS.ALL}`);
      });
    });
    client.on("reconnect", () => setStatus("connecting"));
    client.on("close", () => setStatus("disconnected"));
    client.on("offline", () => setStatus("disconnected"));
    client.on("error", (err) => {
      console.error("[MQTT] error:", err);
      setStatus("error");
    });

    client.on("message", (topic, payloadBuf) => {
      const payload = payloadBuf.toString();
      const now = Date.now();

      setLog((prev) => {
        const next = [{ t: now, topic, payload }, ...prev];
        return next.length > LOG_MAX ? next.slice(0, LOG_MAX) : next;
      });

      // dosagem/evento — schema PT, traduz para internal DoseEvent EN.
      // Também propaga para o store quando evento é "concluida" (atualiza
      // ultimaDosePorProduto para a melhoria "última dose há X").
      if (topic === MQTT_TOPICS.DOSING_EVENT) {
        try {
          const obj = JSON.parse(payload);
          const r = DosingEventSchema.safeParse(obj);
          if (!r.success) {
            console.warn("[MQTT] dosagem/evento rejeitado:", r.error.issues[0]?.message);
            return;
          }
          const internalEvent = wireEventToInternal(r.data.evento);
          const ev: DoseEvent = {
            t: now,
            parameter: r.data.parametro,
            event: internalEvent,
            reason: r.data.motivo,
            doses_hour: r.data.doses_hora,
            doses_day: r.data.doses_dia,
            fonte: r.data.fonte,
          };
          setDosingEvents((prev) => {
            const next = [ev, ...prev];
            return next.length > DOSING_EVENTS_MAX ? next.slice(0, DOSING_EVENTS_MAX) : next;
          });
          if (internalEvent === "completed") {
            usePoolStore.getState().registerDoseCompleted?.(ev.parameter, now);
          }
        } catch {
          /* JSON inválido — ignora */
        }
        return;
      }

      // controle/estado (retain) — schema PT, traduz mode → internal EN.
      if (topic === MQTT_TOPICS.CONTROL_STATE) {
        try {
          const obj = JSON.parse(payload);
          const r = ControlStateSchema.safeParse(obj);
          if (!r.success) {
            console.warn("[MQTT] controle/estado rejeitado:", r.error.issues[0]?.message);
            return;
          }
          setControlState({
            mode: wireModeToInternal(r.data.modo),
            estop: r.data.parada_emergencia,
            dose_in_progress: r.data.dose_em_andamento,
            t: now,
          });
        } catch {
          /* ignora */
        }
        return;
      }

      // sistema/saude — schema PT, traduz para internal SystemHealthMessage EN.
      if (topic === MQTT_TOPICS.SYSTEM_HEALTH) {
        try {
          const obj = JSON.parse(payload);
          const r = SystemHealthSchema.safeParse(obj);
          if (!r.success) {
            console.warn("[MQTT] sistema/saude rejeitado:", r.error.issues[0]?.message);
            return;
          }
          setSystemHealth({
            t: now,
            uptime_s: r.data.tempo_ativo_s,
            free_heap_kb: r.data.heap_livre_kb,
            wifi_rssi_dbm: r.data.rssi_wifi_dbm,
            dht_errors: r.data.erros_dht,
            ds_errors: r.data.erros_ds,
            mqtt_failures: r.data.falhas_mqtt,
            doses_today: r.data.doses_hoje,
          });
        } catch {
          /* ignora */
        }
        return;
      }

      if (topic !== MQTT_TOPICS.DATA) return;

      const parsed = parseConsolidated(payload);
      if (!parsed) return;

      lastRealAtRef.current = now;
      setData(parsed);
      setCycle(parsed.ciclo);
      setLastMessageAt(now);
      setMessagesReceivedCount((c) => c + 1);
      if (sourceRef.current !== "mqtt") {
        sourceRef.current = "mqtt";
        setSource("mqtt");
        setGapState((s) => resetBaseline(s));
      }
      if (typeof parsed.ciclo === "number") {
        setGapState((s) => pushCycle(s, parsed.ciclo, now));
      }

      usePoolStore.getState().ingestFromMqtt(parsed);
      usePoolStore.getState()._stopSimulation?.();
    });

    watchdogRef.current = setInterval(() => {
      const since = Date.now() - lastRealAtRef.current;
      if (since > FALLBACK_AFTER_MS) {
        if (sourceRef.current !== "fallback") {
          sourceRef.current = "fallback";
          setSource("fallback");
          setGapState((s) => resetBaseline(s));
        }
        usePoolStore.getState()._start();
      }
    }, 2000);

    return () => {
      if (watchdogRef.current) clearInterval(watchdogRef.current);
      try {
        client.end(true);
      } catch {
        /* ignore */
      }
      clientRef.current = null;
    };
  }, []);

  // Publishers — sempre em PT (firmware PT consome).
  // Throttle de 1s por (topic+payload). Status !== "connected" rejeita.
  const lastPublishRef = useRef<Record<string, number>>({});
  const publishWithThrottle = useCallback(
    (topic: string, payloadObj: Record<string, unknown>) => {
      const client = clientRef.current;
      if (!client || status !== "connected") {
        return Promise.reject(new Error("MQTT desconectado — comando não enviado"));
      }
      const key = topic + ":" + JSON.stringify(payloadObj);
      const now = Date.now();
      const last = lastPublishRef.current[key] ?? 0;
      if (now - last < COMMAND_THROTTLE_MS) {
        return Promise.resolve();
      }
      lastPublishRef.current[key] = now;
      return new Promise<void>((resolve, reject) => {
        client.publish(topic, JSON.stringify(payloadObj), { qos: 0, retain: false }, (err) =>
          err ? reject(err) : resolve(),
        );
      });
    },
    [status],
  );

  const publishMode = useCallback(
    // Internal EN → wire PT no payload.
    (mode: ControlMode) => publishWithThrottle(TOPIC_CONTROL_MODE, { modo: internalModeToWire(mode) }),
    [publishWithThrottle],
  );
  const publishDosingCommand = useCallback(
    (parameter: DoseChemical) => publishWithThrottle(TOPIC_DOSING_COMMAND, { parametro: parameter }),
    [publishWithThrottle],
  );

  const value = useMemo<MqttContextValue>(
    () => ({
      status,
      source,
      lastMessageAt,
      cycle,
      log,
      data,
      gaps: gapState.gaps,
      totalGaps: gapState.totalGaps,
      messagesReceivedCount,
      providerMountedAt,
      dosingEvents,
      controlState,
      systemHealth,
      publishMode,
      publishDosingCommand,
    }),
    [
      status,
      source,
      lastMessageAt,
      cycle,
      log,
      data,
      gapState,
      messagesReceivedCount,
      providerMountedAt,
      dosingEvents,
      controlState,
      systemHealth,
      publishMode,
      publishDosingCommand,
    ],
  );

  return <MqttContext.Provider value={value}>{children}</MqttContext.Provider>;
}

export function useMqtt(): MqttContextValue {
  return useContext(MqttContext);
}

export function useMqttCommands(): {
  publishMode: (mode: ControlMode) => Promise<void>;
  publishDosingCommand: (parameter: DoseChemical) => Promise<void>;
} {
  const { publishMode, publishDosingCommand } = useContext(MqttContext);
  return { publishMode, publishDosingCommand };
}
