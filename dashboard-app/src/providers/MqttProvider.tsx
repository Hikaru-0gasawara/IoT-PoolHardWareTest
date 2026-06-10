// MqttProvider — fonte única de dados em tempo real do ESP32 (firmware v3.1).
//
// Conecta ao HiveMQ Cloud (wss://...hivemq.cloud:8884/mqtt) e assina aquasense-ibmec-pt/#.
// Fonte de verdade da UI: o payload consolidado (retain) publicado em
// aquasense-ibmec-pt/dados. Cada payload é parseado e empurrado para o
// poolStore via ingestFromMqtt() — toda a UI continua funcionando sem mudanças.
//
// Comandos de dosagem manual são publicados em aquasense-ibmec-pt/dosagem/comando
// com payload { parametro, origem, comando_id }. O firmware responde em
// aquasense-ibmec-pt/dosagem/evento com { parametro, evento, motivo, fonte }.
//
// Fallback automático: se ficar 15s sem snapshot real, ativa a simulação local
// (poolStore._start). Quando o broker volta a publicar, a simulação para.

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
import { z } from "zod";
import {
  type AquaSenseData,
  type DataSource,
  type DoseChemical,
  type DosingResponse,
  type MqttConnectionStatus,
  type MqttContextValue,
  type MqttLogEntry,
  type SensorFailureCounts,
  isSensorError,
} from "@/types/firmware";
import { usePoolStore } from "@/store/poolStore";
import { waterStatusFor } from "@/lib/thresholds";
import {
  MQTT_TOPICS,
  TOPIC_DOSING_COMMAND,
  TOPIC_CONTROL_MODE,
  TOPIC_DOSING_MODE,
  toFirmwareMode,
  fromFirmwareMode,
} from "@/lib/mqttTopics";
import {
  type GapDetectorState,
  createGapDetector,
  pushCycle,
  resetBaseline,
} from "@/lib/cycleGaps";

// Broker — HiveMQ Cloud (TLS/WSS 8884), mesmo cluster do firmware (USAR_TLS 1).
// Configurável (e OBRIGATÓRIO) por env: VITE_MQTT_URL / _USERNAME / _PASSWORD.
//
// IMPORTANTE: NÃO definir valores-padrão (fallback) aqui. Esta env é embutida
// no bundle JS público — qualquer visitante do dashboard implantado consegue
// abrir o "view-source" e ler credenciais hardcoded, ganhando acesso de
// publish ao broker real (dosagem química, modo da bomba, E-Stop). Configure
// `dashboard-app/.env.local` (gitignored, nunca commitado) com as credenciais
// do SEU cluster — ver `.env.example`. Sem essas variáveis o provider roda em
// simulação local (mesmo modo do demo público), nunca com credenciais embutidas.
const ENV = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
const MQTT_URL = ENV.VITE_MQTT_URL;
const MQTT_USERNAME = ENV.VITE_MQTT_USERNAME;
const MQTT_PASSWORD = ENV.VITE_MQTT_PASSWORD;

// Modo demo público — para builds expostas na internet (deploy), sem dono
// presente para acompanhar quem acessa. Quando VITE_PUBLIC_DEMO=true, o
// provider nunca conecta ao broker real: roda só a simulação local, e — como
// efeito colateral desejado — bloqueia comandos reais (clientRef permanece
// null), então visitantes anônimos não conseguem operar a piscina de verdade.
// Instâncias pessoais (dev local, túnel) não definem essa env var e
// continuam recebendo a telemetria real normalmente.
const PUBLIC_DEMO_MODE = ENV.VITE_PUBLIC_DEMO === "true";
const FALLBACK_AFTER_MS = 15_000;
const LOG_MAX = 50;
const RESPONSES_MAX = 50;
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
  dosingResponses: [],
  firmwareOnline: null,
  sensorFailures: { ph: 0, cloro: 0, alcalinidade: 0, piscina: 0, coletor: 0 },
  publishDosingCommand: noopAsync,
  publishControlMode: noopAsync,
  publishDosingMode: noopAsync,
});

const SENTINEL = -99.0;

const numInRange = (min: number, max: number) =>
  z
    .number()
    .finite()
    .refine((v) => v === SENTINEL || (v >= min && v <= max), {
      message: `fora da faixa [${min}, ${max}]`,
    });

const DoseChemEnum = z.enum(["cloro", "acido", "base"]);
const BombaEnum = z.union([z.enum(["ON", "OFF", "LIGADA", "DESLIGADA"]), z.boolean()]);

// ─────────────────────────────────────────────────────────────────────
// Schema do payload consolidado (aquasense-ibmec-pt/dados, retain).
// Payload flat do firmware v3.0:
//   { projeto, ciclo, ph, orp_mv, cloro, alcalinidade, condutividade_us_cm,
//     temp_piscina, temp_coletor, delta_t, umidade, bomba, alertas,
//     modo, parada_emergencia, dose_em_andamento }
// A UI consome ph / orp_mv / condutividade_us_cm; cloro/alcalinidade ficam
// disponíveis no payload (passthrough) mas não são exibidos.
// ─────────────────────────────────────────────────────────────────────
export const SnapshotSchema = z
  .object({
    ph: numInRange(0, 14),
    // Limites alinhados aos clamps de calcularCloroLivre()/calcularAlcalinidade()
    // no firmware (AquaSense.ino): 0.05–15.0 ppm e 0–500 ppm. Faixas menores
    // (0–10 / 0–200) rejeitavam o payload INTEIRO sempre que o firmware
    // publicasse um valor derivado fora do "normal" — exatamente o cenário
    // (alerta crítico) que a UI mais precisa exibir.
    cloro: numInRange(0, 15),
    alcalinidade: numInRange(0, 500),
    // Opcional: a UI consome cloro/alcalinidade derivados; um firmware que não
    // publique condutividade não deve ter o snapshot inteiro rejeitado.
    condutividade_us_cm: numInRange(0, 5000).optional(),
    temp_piscina: numInRange(-10, 100),
    temp_coletor: numInRange(-10, 150),
    delta_t: z.number().finite().min(-100).max(100).optional(),
    umidade: z.number().finite().min(-1).max(100).optional(),
    bomba: BombaEnum,
    alertas: z.array(z.string().max(200)).max(20).optional(),
    ciclo: z.number().int().min(0).max(10_000_000).optional(),
    timestamp_ms: z.number().int().min(0).optional(),
  })
  .passthrough();

// ─────────────────────────────────────────────────────────────────────
// Schema do evento de dosagem (aquasense-ibmec-pt/dosagem/evento).
// Payload do firmware v3.0: { parametro, evento, motivo?, fonte }
// ─────────────────────────────────────────────────────────────────────
export const DosingEventSchema = z
  .object({
    parametro: DoseChemEnum,
    evento: z.enum(["iniciada", "concluida", "bloqueada"]),
    motivo: z.string().max(200).optional(),
    fonte: z.string().max(40).optional(),
  })
  .passthrough();

// Compat: alias mantido para call sites/testes que referenciam o nome antigo.
export const DosingResponseSchema = DosingEventSchema;

// Mapeia o evento do firmware para o resultado exibido na UI.
function eventoToResultado(
  evento: "iniciada" | "concluida" | "bloqueada",
): DosingResponse["resultado"] {
  if (evento === "bloqueada") return "bloqueado";
  return "ok";
}

// ─────────────────────────────────────────────────────────────────────
// Schema do comando que o DASHBOARD publica (validação defensiva pré-envio).
// ─────────────────────────────────────────────────────────────────────
export const DosingCommandSchema = z.object({
  parametro: DoseChemEnum,
  origem: z.enum(["manual", "automatico"]),
  comando_id: z.string().min(1).max(128),
});

// Parser puro do snapshot — exportado para testes de fixture.
export function parseSnapshot(raw: string): AquaSenseData | null {
  try {
    if (raw.length > 8192) return null;
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== "object") return null;

    const r = SnapshotSchema.safeParse(obj);
    if (!r.success) {
      console.warn("[MQTT] snapshot rejeitado:", r.error.issues[0]?.message);
      return null;
    }
    const f = r.data;
    const ph = f.ph;
    const cloro = ((f as Record<string, unknown>).cloro as number | undefined) ?? -99;
    const alcalinidade = ((f as Record<string, unknown>).alcalinidade as number | undefined) ?? -99;
    const tPool = f.temp_piscina;
    const tSolar = f.temp_coletor;
    const dT = f.delta_t ?? tSolar - tPool;
    const hum = f.umidade ?? -1;
    const pumpOn = f.bomba === "ON" || f.bomba === "LIGADA" || f.bomba === true;
    const alerts = (f.alertas ?? []).slice(0, 20);

    // Estado de controle reportado pelo firmware (passthrough em .../dados).
    const ctrlRaw = f as Record<string, unknown>;
    const modoRaw = ctrlRaw.modo;
    const modoDosagemRaw = ctrlRaw.modo_dosagem;
    const doseRaw = ctrlRaw.dose_em_andamento;

    return {
      projeto: "AquaSense IoT",
      ciclo: f.ciclo ?? 0,
      qualidade_agua: {
        ph,
        ph_status: waterStatusFor("ph", ph),
        cloro,
        cloro_status: waterStatusFor("cloro", cloro),
        alcalinidade,
        alcalinidade_status: waterStatusFor("alcalinidade", alcalinidade),
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
        modo: typeof modoRaw === "string" ? fromFirmwareMode(modoRaw) : undefined,
        modo_dosagem:
          typeof modoDosagemRaw === "string" ? fromFirmwareMode(modoDosagemRaw) : undefined,
        parada_emergencia: ctrlRaw.parada_emergencia === true,
        dose_em_andamento: typeof doseRaw === "string" ? doseRaw : null,
      },
      alertas: alerts,
    };
  } catch {
    return null;
  }
}

function genCommandId(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
  } catch {
    /* ignore */
  }
  return `cmd-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
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
  const [dosingResponses, setDosingResponses] = useState<DosingResponse[]>([]);
  // Último estado do LWT do firmware em sistema/status ("online"/"offline",
  // retain). null = nenhuma mensagem recebida ainda nesta sessão.
  const [firmwareOnline, setFirmwareOnline] = useState<boolean | null>(null);
  const [sensorFailures, setSensorFailures] = useState<SensorFailureCounts>({
    ph: 0,
    cloro: 0,
    alcalinidade: 0,
    piscina: 0,
    coletor: 0,
  });
  const [providerMountedAt] = useState(() => Date.now());

  const clientRef = useRef<ReturnType<typeof mqtt.connect> | null>(null);
  const lastRealAtRef = useRef<number>(0);
  const sourceRef = useRef<DataSource>("none");
  const watchdogRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (PUBLIC_DEMO_MODE || !MQTT_URL) {
      if (!PUBLIC_DEMO_MODE) {
        console.warn(
          "[MQTT] VITE_MQTT_URL não configurado — rodando em simulação local. " +
            "Veja dashboard-app/.env.example para configurar seu broker.",
        );
      }
      sourceRef.current = "fallback";
      setSource("fallback");
      setStatus("disconnected");
      usePoolStore.getState()._start();
      return () => {
        usePoolStore.getState()._stopSimulation?.();
      };
    }

    const client = mqtt.connect(MQTT_URL, {
      reconnectPeriod: 4000,
      connectTimeout: 8000,
      clean: true,
      username: MQTT_USERNAME,
      password: MQTT_PASSWORD,
    });
    clientRef.current = client;

    client.on("connect", () => {
      setStatus("connected");
      client.subscribe(MQTT_TOPICS.ALL, { qos: 0 }, () => undefined);
    });
    client.on("reconnect", () => setStatus("connecting"));
    client.on("offline", () => setStatus("disconnected"));
    client.on("error", () => setStatus("error"));

    client.on("message", (topic: string, payloadBuf: Uint8Array) => {
      const payload = payloadBuf.toString();
      const now = Date.now();

      setLog((prev) => {
        const next = [{ t: now, topic, payload }, ...prev];
        return next.length > LOG_MAX ? next.slice(0, LOG_MAX) : next;
      });

      // sistema/status — LWT do firmware (retain): "online" ao conectar,
      // "offline" publicado pelo BROKER se o ESP32 cair sem se despedir.
      // Sinal mais rápido que o watchdog de 15s (FALLBACK_AFTER_MS), que só
      // detecta a ausência de novos snapshots em .../dados.
      if (topic === MQTT_TOPICS.SISTEMA_STATUS) {
        setFirmwareOnline(payload === "online");
        return;
      }

      // dosagem/evento — feedback assíncrono de um comando de dosagem.
      if (topic === MQTT_TOPICS.DOSAGEM_EVENTO) {
        try {
          const obj = JSON.parse(payload);
          const r = DosingEventSchema.safeParse(obj);
          if (!r.success) {
            console.warn("[MQTT] dosagem/evento rejeitado:", r.error.issues[0]?.message);
            return;
          }
          const resp: DosingResponse = {
            t: now,
            parametro: r.data.parametro,
            evento: r.data.evento,
            resultado: eventoToResultado(r.data.evento),
            motivo: r.data.motivo,
            fonte: r.data.fonte,
          };
          setDosingResponses((prev) => {
            const next = [resp, ...prev];
            return next.length > RESPONSES_MAX ? next.slice(0, RESPONSES_MAX) : next;
          });
          if (r.data.evento === "concluida") {
            usePoolStore.getState().registerDoseCompleted(r.data.parametro, now);
          }
        } catch {
          /* JSON inválido — ignora */
        }
        return;
      }

      // Payload consolidado — única fonte que alimenta o store.
      if (topic !== MQTT_TOPICS.DADOS) return;

      const parsed = parseSnapshot(payload);
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

      // Contadores de falha por sensor — incrementa quando a leitura chega
      // com o valor sentinela de erro (-99) neste snapshot.
      const wq = parsed.qualidade_agua;
      const tp = parsed.temperaturas;
      setSensorFailures((prev) => ({
        ph: prev.ph + (isSensorError(wq.ph) ? 1 : 0),
        cloro: prev.cloro + (isSensorError(wq.cloro) ? 1 : 0),
        alcalinidade: prev.alcalinidade + (isSensorError(wq.alcalinidade) ? 1 : 0),
        piscina: prev.piscina + (isSensorError(tp.piscina_C) ? 1 : 0),
        coletor: prev.coletor + (isSensorError(tp.coletor_solar_C) ? 1 : 0),
      }));

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

  // Throttle de 1s por (topic+payload). Status !== "connected" rejeita.
  const lastPublishRef = useRef<Record<string, number>>({});
  const publishWithThrottle = useCallback(
    (topic: string, payloadObj: Record<string, unknown>, throttleKey: string) => {
      const client = clientRef.current;
      if (!client || status !== "connected") {
        return Promise.reject(new Error("MQTT desconectado — comando não enviado"));
      }
      const now = Date.now();
      const last = lastPublishRef.current[throttleKey] ?? 0;
      if (now - last < COMMAND_THROTTLE_MS) {
        // Antes resolvia silenciosamente (Promise.resolve()), e a UI exibia
        // "Comando enviado" mesmo sem publicar nada — falso positivo. Agora
        // rejeita com um motivo claro; quem chama já trata catch() e mostra
        // a mensagem de erro ao usuário.
        return Promise.reject(new Error("Aguarde um instante antes de repetir o comando"));
      }
      lastPublishRef.current[throttleKey] = now;
      return new Promise<void>((resolve, reject) => {
        // QoS 1 (at-least-once): comandos críticos (dosagem, modo, E-Stop) não
        // podem ser silenciosamente descartados em conexões instáveis — mesmo
        // nível usado pela skill Alexa (alexa/lambda/mqtt-bridge.js).
        client.publish(topic, JSON.stringify(payloadObj), { qos: 1, retain: false }, (err) =>
          err ? reject(err) : resolve(),
        );
      });
    },
    [status],
  );

  const publishDosingCommand = useCallback(
    (parameter: DoseChemical) =>
      publishWithThrottle(
        TOPIC_DOSING_COMMAND,
        { parametro: parameter, origem: "manual", comando_id: genCommandId() },
        `dosagem:${parameter}`,
      ),
    [publishWithThrottle],
  );

  // Traduz o modo da UI ("parado") para o vocabulário do firmware ("parada")
  // antes de publicar — senão o firmware descarta o comando em silêncio.
  const publishControlMode = useCallback(
    (modo: import("@/types/aquasense").PumpMode) =>
      publishWithThrottle(TOPIC_CONTROL_MODE, { modo: toFirmwareMode(modo) }, `controle:modo`),
    [publishWithThrottle],
  );

  const publishDosingMode = useCallback(
    (modo: import("@/types/aquasense").PumpMode) =>
      publishWithThrottle(TOPIC_DOSING_MODE, { modo: toFirmwareMode(modo) }, `dosagem:modo`),
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
      dosingResponses,
      firmwareOnline,
      sensorFailures,
      publishDosingCommand,
      publishControlMode,
      publishDosingMode,
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
      dosingResponses,
      firmwareOnline,
      sensorFailures,
      publishDosingCommand,
      publishControlMode,
      publishDosingMode,
    ],
  );

  return <MqttContext.Provider value={value}>{children}</MqttContext.Provider>;
}

export function useMqtt(): MqttContextValue {
  return useContext(MqttContext);
}

export function useMqttCommands(): {
  publishDosingCommand: (parameter: DoseChemical) => Promise<void>;
} {
  const { publishDosingCommand } = useContext(MqttContext);
  return { publishDosingCommand };
}
