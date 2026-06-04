// poolStore — fonte única de verdade do dashboard.
//
// Em produção os dados chegam pelo MqttProvider, que assina o broker público
// `broker.hivemq.com` no namespace `aquasense-ibmec/` e empurra cada amostra
// para `ingestFromMqtt()`. Se o ESP32 ficar > 15 s sem publicar, o provider
// liga `_start()` para rodar a simulação local como fallback (banner discreto
// avisa o usuário). O controle real da bomba (histerese ΔT 5°C/1°C com
// anti-cycling de 60 s) acontece no firmware embarcado — o dashboard apenas
// reflete o estado.

import { create } from "zustand";
import type { AggregatedAlert, ParameterKey, PoolState, PumpMode, SensorPoint } from "@/types/aquasense";
import type { AquaSenseData } from "@/types/firmware";
import { isSensorError } from "@/types/firmware";
import {
  clamp, decidePump, nextCloro, nextAlcalinidade, nextPh,
  nextPoolTemp, nextSolarTemp, seedHistory,
} from "@/lib/simulation";
import { aggregateStatus, statusFor, THRESHOLDS } from "@/lib/thresholds";
import { SIM, POOL } from "@/lib/constants";

const LS_KEY = "aquasense:settings:v1";
const RESOLVED_RETENTION_MS = 24 * 60 * 60 * 1000; // mantém resolvidos por 24h
const OPEN_AFTER_CYCLES = 3;
const RESOLVE_AFTER_CYCLES = 5;

export type ParamReading = { key: ParameterKey; value: number };

// Estatísticas de uma única passada do agregador. Acumuladas no store
// como contadores de sessão para a aba Diagnóstico.
//   - opened: quantos alertas REAIS abriram neste tick (shadow → ativo)
//   - escalations: quantos passaram de warn → crit (zera ack, conta uma vez)
//   - resolved: quantos transitaram de ativo → resolvido neste tick
// Tempo médio de resolução é calculado na UI a partir do array de alerts
// (resolvido_em - iniciado_em), portanto não precisa ser contador aqui.
export interface AggregatorTickStats {
  opened: number;
  escalations: number;
  resolved: number;
}

// Roda a máquina de estado dos alertas agregados a cada ciclo (≈5s).
// Versão "rica": devolve o array atualizado + estatísticas do tick.
// `processAggregatedAlerts` (abaixo) continua como wrapper devolvendo só
// o array, para call sites que não querem stats.
export function processAggregatedAlertsWithStats(
  current: AggregatedAlert[],
  readings: ParamReading[],
  now: number,
): { alerts: AggregatedAlert[]; stats: AggregatorTickStats } {
  const stats: AggregatorTickStats = { opened: 0, escalations: 0, resolved: 0 };
  // 1) descarta resolvidos antigos
  let next = current.filter(
    (a) => a.status !== "resolvido" || (a.resolvido_em != null && now - a.resolvido_em < RESOLVED_RETENTION_MS),
  );

  // index por parametro (no máximo 1 alerta REAL ativo por parametro;
  // shadows são pré-aberturas e não contam como alerta existente)
  const activeByParam = new Map<ParameterKey, AggregatedAlert>();
  next.forEach((a) => {
    if (a.status === "ativo" && !a.id.startsWith("shadow:")) activeByParam.set(a.parametro, a);
  });

  for (const { key, value } of readings) {
    const lvl = statusFor(key, value); // "ok" | "warn" | "crit"
    const t = THRESHOLDS[key];
    const existing = activeByParam.get(key);

    if (lvl === "ok") {
      // dentro da faixa
      if (existing) {
        const dentro = existing.ciclos_consecutivos_dentro + 1;
        const updated: AggregatedAlert = {
          ...existing,
          ciclos_consecutivos_dentro: dentro,
          ciclos_consecutivos_fora: 0,
          valor_atual: value,
          ultimo_update_t: now,
        };
        if (dentro >= RESOLVE_AFTER_CYCLES) {
          updated.status = "resolvido";
          updated.resolvido_em = now;
          activeByParam.delete(key);
          stats.resolved += 1;
        }
        next = next.map((a) => (a.id === existing.id ? updated : a));
      }
      continue;
    }

    // fora da faixa (warn | crit)
    if (!existing) {
      // candidato: procura registro "pré-aberto" (não criamos um — usamos um
      // contador efêmero embutido em um alerta com status=ativo apenas após
      // OPEN_AFTER_CYCLES). Para manter simples, criamos um shadow no array.
      const shadowId = `shadow:${key}`;
      const shadow = next.find((a) => a.id === shadowId);
      const fora = (shadow?.ciclos_consecutivos_fora ?? 0) + 1;
      if (fora >= OPEN_AFTER_CYCLES) {
        // abre alerta real
        const sev: "warn" | "crit" = lvl;
        const real: AggregatedAlert = {
          id: `${key}:${sev}:${now}`,
          parametro: key,
          severity: sev,
          severity_max: sev,
          status: "ativo",
          iniciado_em: now,
          ultimo_update_t: now,
          resolvido_em: null,
          ack_em: null,
          ciclos_consecutivos_fora: fora,
          ciclos_consecutivos_dentro: 0,
          ocorrencias: 1,
          valor_atual: value,
          valor_min: value,
          valor_max: value,
          faixa_ideal: { min: t.idealMin, max: t.idealMax },
          unidade: t.unit,
        };
        next = next.filter((a) => a.id !== shadowId);
        next = [real, ...next];
        activeByParam.set(key, real);
        stats.opened += 1;
      } else {
        // mantém/cria shadow contando ciclos
        const shadowAlert: AggregatedAlert = {
          id: shadowId,
          parametro: key,
          severity: lvl,
          severity_max: lvl,
          status: "ativo",
          iniciado_em: shadow?.iniciado_em ?? now,
          ultimo_update_t: now,
          resolvido_em: null,
          ack_em: null,
          ciclos_consecutivos_fora: fora,
          ciclos_consecutivos_dentro: 0,
          ocorrencias: 0,
          valor_atual: value,
          valor_min: Math.min(shadow?.valor_min ?? value, value),
          valor_max: Math.max(shadow?.valor_max ?? value, value),
          faixa_ideal: { min: t.idealMin, max: t.idealMax },
          unidade: t.unit,
        };
        next = shadow
          ? next.map((a) => (a.id === shadowId ? shadowAlert : a))
          : [shadowAlert, ...next];
      }
      continue;
    }

    // já existe alerta ativo — atualiza
    const escalou = existing.severity === "warn" && lvl === "crit";
    if (escalou) stats.escalations += 1;
    const updated: AggregatedAlert = {
      ...existing,
      severity: escalou ? "crit" : existing.severity, // não desescala
      severity_max: lvl === "crit" || existing.severity_max === "crit" ? "crit" : "warn",
      ack_em: escalou ? null : existing.ack_em, // escalação zera ack
      ciclos_consecutivos_fora: existing.ciclos_consecutivos_fora + 1,
      ciclos_consecutivos_dentro: 0,
      ocorrencias: existing.ocorrencias + 1,
      valor_atual: value,
      valor_min: Math.min(existing.valor_min, value),
      valor_max: Math.max(existing.valor_max, value),
      ultimo_update_t: now,
    };
    next = next.map((a) => (a.id === existing.id ? updated : a));
  }

  // remove shadows cujos parâmetros voltaram ao OK (não estão em readings fora)
  const foraParams = new Set(readings.filter((r) => statusFor(r.key, r.value) !== "ok").map((r) => r.key));
  next = next.filter((a) => !a.id.startsWith("shadow:") || foraParams.has(a.parametro));

  // limita o array
  return { alerts: next.slice(0, POOL.ALERT_MAX), stats };
}

// Wrapper backward-compat: devolve só o array.
export function processAggregatedAlerts(
  current: AggregatedAlert[],
  readings: ParamReading[],
  now: number,
): AggregatedAlert[] {
  return processAggregatedAlertsWithStats(current, readings, now).alerts;
}

// Filtra os "shadows" internos antes de expor à UI
function visibleAlerts(alerts: AggregatedAlert[]): AggregatedAlert[] {
  return alerts.filter((a) => !a.id.startsWith("shadow:"));
}

interface PersistedSettings {
  setpoint_temp: number;
  bomba_modo: PumpMode;
  ackedAlerts: string[];
  theme: "dark" | "light";
}

function loadSettings(): Partial<PersistedSettings> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveSettings(s: Partial<PersistedSettings>) {
  if (typeof window === "undefined") return;
  try {
    const cur = loadSettings();
    localStorage.setItem(LS_KEY, JSON.stringify({ ...cur, ...s }));
  } catch { /* ignore */ }
}

interface Store extends PoolState {
  // ações
  setSetpoint: (v: number) => void;
  setMode: (m: PumpMode) => void;
  togglePumpManual: () => void;
  acknowledgeAlert: (id: string) => void;
  clearResolvedAlerts: () => void;
  ingestFromMqtt: (data: AquaSenseData) => void;
  // FORK PT (Melhoria 2) — registra timestamp da última dose CONCLUÍDA por
  // produto. Chamado pelo MqttProvider ao receber evento `concluida`.
  // Usado pela aba Controle para mostrar "última há 1h 23m" via useAgora.
  registerDoseCompleted: (chem: "cloro" | "acido" | "base", t: number) => void;
  ultimaDosePorProduto: { cloro: number | null; acido: number | null; base: number | null };
  // Doses CONCLUÍDAS na sessão (epoch ms + produto). Usado para contar
  // dosagens do dia por produto no painel. Não persistido.
  doseTimestamps: { chem: "cloro" | "acido" | "base"; t: number }[];
  // Contadores de sessão acumulados (não persistidos).
  sessionAlertsOpened: number;
  sessionAlertsEscalated: number;
  sessionAlertsResolved: number;
  _cloudLeft: number;
  _started: boolean;
  _intervalId: ReturnType<typeof setInterval> | null;
  _start: () => void;
  _stopSimulation: () => void;
}

function buildInitial(): PoolState {
  const now = new Date();
  const seed = seedHistory(now);
  const last = seed[seed.length - 1];
  const persisted = loadSettings();

  const live: SensorPoint[] = [];
  // populate liveHistory com últimos 12 pontos derivados do seed (resampled p/ 5s)
  for (let i = 0; i < 12; i++) {
    live.push({ ...last, t: now.getTime() - (11 - i) * 5000 });
  }

  // Migration one-shot: lista de alertas começa vazia. Em ~15s (3 ciclos a 5s)
  // os primeiros agregados aparecem conforme parâmetros saem da faixa.
  const initialAlerts: AggregatedAlert[] = [];
  // Reconhecimentos persistidos são reaplicados pelo agregador conforme
  // alertas são reabertos (id determinístico = `${parametro}:${severity}`).
  void persisted.ackedAlerts;

  return {
    ph: last.ph,
    cloro: last.cloro,
    alcalinidade: last.alcalinidade,
    temp_piscina: last.temp_piscina,
    temp_coletor: last.temp_coletor,
    delta_t: last.temp_coletor - last.temp_piscina,
    bomba_ligada: last.bomba_ligada,
    bomba_modo: persisted.bomba_modo ?? "automatico",
    setpoint_temp: persisted.setpoint_temp ?? 30,
    ultima_mudanca_bomba_t: now.getTime() - 1000 * 60 * 12,
    bomba_estado_desde_t: now.getTime() - 1000 * 60 * 12,
    status_geral: "ok",
    ultima_atualizacao_t: now.getTime(),
    uptime_s: 3600 * 26,
    firmware: "v1.2.3-aquasense",
    history: seed,
    liveHistory: live,
    pumpLog: [
      { t: now.getTime() - 1000 * 60 * 12, ligada: true, motivo: "Auto: ΔT 8.2°C ≥ 5°C → LIGAR" },
      { t: now.getTime() - 1000 * 60 * 95, ligada: false, motivo: "Auto: ΔT 0.4°C ≤ 1°C → DESLIGAR" },
      { t: now.getTime() - 1000 * 60 * 130, ligada: true, motivo: "Auto: ΔT 6.1°C ≥ 5°C → LIGAR" },
    ],
    alerts: initialAlerts,
    cloroEvents: [],
    lastTickAt: now.getTime(),
  };
}

// Detecta cruzamento de faixa do Cloro entre duas leituras consecutivas.
// Devolve um ChemEvent quando a leitura ENTRA ou SAI da faixa ideal
// (1.0–3.0 ppm), ou `null` quando não há transição relevante.
function detectChlorineEvent(prev: number, cur: number, now: number): import("@/types/aquasense").ChemEvent | null {
  if (isSensorError(prev) || isSensorError(cur)) return null;
  const prevStatus = statusFor("cloro", prev);
  const curStatus = statusFor("cloro", cur);
  const prevOk = prevStatus === "ok";
  const curOk = curStatus === "ok";
  if (prevOk === curOk) return null; // sem cruzamento de faixa
  const t = THRESHOLDS.cloro;
  const direcao: "baixo" | "alto" | "ideal" = curOk
    ? "ideal"
    : cur < t.idealMin
      ? "baixo"
      : "alto";
  return {
    t: now,
    parametro: "cloro",
    tipo: curOk ? "entrou_faixa" : "saiu_faixa",
    direcao,
    valor: cur,
    severity: curStatus,
  };
}

export const usePoolStore = create<Store>((set, get) => ({
  ...buildInitial(),
  sessionAlertsOpened: 0,
  sessionAlertsEscalated: 0,
  sessionAlertsResolved: 0,
  ultimaDosePorProduto: { cloro: null, acido: null, base: null },
  doseTimestamps: [],
  _ticksSinceDose: 0,
  _cloudLeft: 0,
  _started: false,
  _intervalId: null,

  registerDoseCompleted: (chem, t) => {
    const s = get();
    set({
      ultimaDosePorProduto: { ...s.ultimaDosePorProduto, [chem]: t },
      doseTimestamps: [...s.doseTimestamps, { chem, t }].slice(-200),
    });
  },

  setSetpoint: (v) => {
    const value = clamp(v, POOL.SETPOINT_MIN, POOL.SETPOINT_MAX);
    saveSettings({ setpoint_temp: value });
    set({ setpoint_temp: value });
  },
  setMode: (m) => {
    saveSettings({ bomba_modo: m });
    set({ bomba_modo: m });
  },
  togglePumpManual: () => {
    const s = get();
    if (s.bomba_modo !== "manual") return;
    const elapsed = (Date.now() - s.ultima_mudanca_bomba_t) / 1000;
    if (elapsed < SIM.ANTI_CYCLING_S) return;
    const newState = !s.bomba_ligada;
    const now = Date.now();
    set({
      bomba_ligada: newState,
      ultima_mudanca_bomba_t: now,
      bomba_estado_desde_t: now,
      pumpLog: [
        { t: now, ligada: newState, motivo: `Manual: usuário ${newState ? "LIGOU" : "DESLIGOU"} a bomba` },
        ...s.pumpLog,
      ].slice(0, POOL.PUMP_LOG_MAX),
    });
  },
  acknowledgeAlert: (id) => {
    const s = get();
    const now = Date.now();
    const next = s.alerts.map((a) =>
      a.id === id && a.status === "ativo" && a.ack_em == null
        ? { ...a, ack_em: now }
        : a,
    );
    saveSettings({ ackedAlerts: next.filter((a) => a.ack_em != null && a.status === "ativo").map((a) => a.id) });
    set({ alerts: next });
  },
  clearResolvedAlerts: () => {
    set({ alerts: get().alerts.filter((a) => a.status !== "resolvido") });
  },

  // Ingestão de dados reais vindos do firmware (tópico aquasense-ibmec/data).
  // Mapeia campos do payload para o estado do store. Valores -99.0 (erro de
  // sensor) são preservados como NaN nas leituras atuais — a UI é responsável
  // por exibir "ERRO" via isSensorError(). Histórico ignora amostras com erro.
  ingestFromMqtt: (d) => {
    const s = get();
    const now = Date.now();
    const wq = d.qualidade_agua;
    const tp = d.temperaturas;
    const ctrl = d.controle;

    const ph = wq.ph;
    const cloro = wq.cloro;
    const alcalinidade = wq.alcalinidade;
    const temp_piscina = tp.piscina_C;
    const temp_coletor = tp.coletor_solar_C;
    const delta_t = typeof tp.delta_T === "number" ? tp.delta_T : (temp_coletor - temp_piscina);
    const bomba_ligada = ctrl.bomba === "LIGADA";

    // pumpLog: registra mudança de estado da bomba reportada pelo ESP32
    let pumpLog = s.pumpLog;
    let ultima_mudanca = s.ultima_mudanca_bomba_t;
    let estado_desde = s.bomba_estado_desde_t;
    if (bomba_ligada !== s.bomba_ligada) {
      ultima_mudanca = now;
      estado_desde = now;
      pumpLog = [{
        t: now,
        ligada: bomba_ligada,
        motivo: `ESP32 (auto): ΔT ${delta_t.toFixed(1)}°C → ${bomba_ligada ? "LIGAR" : "DESLIGAR"}`,
      }, ...pumpLog].slice(0, POOL.PUMP_LOG_MAX);
    }

    // Alertas agregados — derivados das leituras reais (não mais de strings do firmware).
    // O array `d.alertas` continua disponível via useAlerts() como visão "raw" do ciclo,
    // mas a lógica de abertura/escalação/resolução vive aqui.
    const aggReadingsRaw: ParamReading[] = [
      { key: "ph" as ParameterKey, value: ph },
      { key: "cloro" as ParameterKey, value: cloro },
      { key: "alcalinidade" as ParameterKey, value: alcalinidade },
      { key: "temp_piscina" as ParameterKey, value: temp_piscina },
    ];
    const aggReadings = aggReadingsRaw.filter((r) => !isSensorError(r.value));
    const aggOut = processAggregatedAlertsWithStats(s.alerts, aggReadings, now);
    const nextAlerts = aggOut.alerts;

    // Sparkline (5s) — ignora pontos com erro de sensor
    const validPoint = !isSensorError(temp_piscina) && !isSensorError(temp_coletor)
      && !isSensorError(ph) && !isSensorError(cloro) && !isSensorError(alcalinidade);
    let liveHistory = s.liveHistory;
    let history = s.history;
    if (validPoint) {
      const point: SensorPoint = {
        t: now, ph, cloro, alcalinidade, temp_piscina, temp_coletor, bomba_ligada,
      };
      liveHistory = [...s.liveHistory, point].slice(-SIM.LIVE_HISTORY_MAX);
      // Para dados reais via MQTT, adicionamos cada amostra ao histórico
      // imediatamente (sem o gate de 5 min usado pela simulação local) — assim
      // os gráficos avançam em tempo real conforme o ESP32 publica.
      const lastH = history[history.length - 1];
      if (!lastH || now - lastH.t >= 1000) {
        history = [...history, point].slice(-SIM.HISTORY_MAX);
      }
    }

    const status_geral = aggregateStatus({ ph, cloro, alcalinidade, temp_piscina });

    // Eventos discretos de cruzamento de faixa do Cloro (1.0–3.0 ppm).
    const cloroEvt = detectChlorineEvent(s.cloro, cloro, now);
    const cloroEvents = cloroEvt
      ? [cloroEvt, ...s.cloroEvents].slice(0, POOL.CLORO_EVENT_MAX)
      : s.cloroEvents;

    set({
      ph, cloro, alcalinidade, temp_piscina, temp_coletor, delta_t,
      bomba_ligada,
      ultima_mudanca_bomba_t: ultima_mudanca,
      bomba_estado_desde_t: estado_desde,
      pumpLog, liveHistory, history,
      alerts: nextAlerts,
      cloroEvents,
      status_geral,
      ultima_atualizacao_t: now,
      lastTickAt: now,
      sessionAlertsOpened: s.sessionAlertsOpened + aggOut.stats.opened,
      sessionAlertsEscalated: s.sessionAlertsEscalated + aggOut.stats.escalations,
      sessionAlertsResolved: s.sessionAlertsResolved + aggOut.stats.resolved,
    });
  },

  _start: () => {
    if (get()._started || typeof window === "undefined") return;
    set({ _started: true });

    const tick = () => {
      const s = get();
      const now = Date.now();
      const date = new Date(now);

      // Coletor
      const { value: temp_coletor, cloudLeft } = nextSolarTemp(s.temp_coletor, date, s._cloudLeft);
      // ΔT calculado com piscina anterior
      const dtPre = temp_coletor - s.temp_piscina;
      // Decisão da bomba
      const decision = decidePump({
        bombaOn: s.bomba_ligada,
        deltaT: dtPre,
        modo: s.bomba_modo,
        agora: now,
        ultimaMudanca: s.ultima_mudanca_bomba_t,
      });

      let bomba_ligada = s.bomba_ligada;
      let ultima_mudanca = s.ultima_mudanca_bomba_t;
      let estado_desde = s.bomba_estado_desde_t;
      let pumpLog = s.pumpLog;
      if (decision.newState !== s.bomba_ligada) {
        bomba_ligada = decision.newState;
        ultima_mudanca = now;
        estado_desde = now;
        pumpLog = [{ t: now, ligada: bomba_ligada, motivo: decision.reason }, ...pumpLog].slice(0, POOL.PUMP_LOG_MAX);
      }

      // Piscina
      const temp_piscina = nextPoolTemp(s.temp_piscina, bomba_ligada, dtPre, date.getHours());
      const delta_t = temp_coletor - temp_piscina;

      // Químicos / parâmetros de água (firmware v3.1: pH, cloro, alcalinidade)
      const ph = nextPh(s.ph);
      const cloro = nextCloro(s.cloro);
      const alcalinidade = nextAlcalinidade(s.alcalinidade);

      // Alertas agregados — máquina de estado 3 ciclos abre / 5 fecha
      const aggReadings: ParamReading[] = [
        { key: "ph", value: ph },
        { key: "cloro", value: cloro },
        { key: "alcalinidade", value: alcalinidade },
        { key: "temp_piscina", value: temp_piscina },
      ];
      const aggOut = processAggregatedAlertsWithStats(s.alerts, aggReadings, now);
      const nextAlerts = aggOut.alerts;

      // Update liveHistory (5s)
      const live = [...s.liveHistory, {
        t: now, ph, cloro, alcalinidade,
        temp_piscina, temp_coletor, bomba_ligada,
      }].slice(-SIM.LIVE_HISTORY_MAX);

      // Update history (5min) — só adiciona quando passa STEP_MS
      let history = s.history;
      const lastH = history[history.length - 1];
      if (!lastH || now - lastH.t >= SIM.HISTORY_STEP_MS) {
        history = [...history, {
          t: now, ph, cloro, alcalinidade,
          temp_piscina, temp_coletor, bomba_ligada,
        }].slice(-SIM.HISTORY_MAX);
      }

      const status_geral = aggregateStatus({ ph, cloro, alcalinidade, temp_piscina });

      // Eventos discretos de cruzamento de faixa do Cloro (1.0–3.0 ppm).
      const cloroEvt = detectChlorineEvent(s.cloro, cloro, now);
      const cloroEvents = cloroEvt
        ? [cloroEvt, ...s.cloroEvents].slice(0, POOL.CLORO_EVENT_MAX)
        : s.cloroEvents;

      set({
        ph, cloro, alcalinidade, temp_piscina, temp_coletor,
        delta_t, bomba_ligada,
        ultima_mudanca_bomba_t: ultima_mudanca,
        bomba_estado_desde_t: estado_desde,
        pumpLog,
        liveHistory: live, history,
        alerts: nextAlerts,
        cloroEvents,
        status_geral,
        ultima_atualizacao_t: now,
        uptime_s: s.uptime_s + 5,
        lastTickAt: now,
        _cloudLeft: cloudLeft,
        sessionAlertsOpened: s.sessionAlertsOpened + aggOut.stats.opened,
        sessionAlertsEscalated: s.sessionAlertsEscalated + aggOut.stats.escalations,
        sessionAlertsResolved: s.sessionAlertsResolved + aggOut.stats.resolved,
      });
    };

    const id = setInterval(() => {
      try { tick(); } catch (err) { console.error("[AquaSense] simulation tick failed:", err); }
    }, SIM.TICK_MS);
    set({ _intervalId: id });
  },

  // Para a simulação local (chamado quando MQTT real começa a publicar).
  _stopSimulation: () => {
    const id = get()._intervalId;
    if (id) {
      clearInterval(id);
      set({ _intervalId: null, _started: false });
    }
  },
}));

// Hook conveniente que dispara o engine no primeiro mount
export function useStartSimulation() {
  if (typeof window !== "undefined") {
    usePoolStore.getState()._start();
  }
}
