// poolStore — fonte única de verdade do dashboard.
//
// Em produção os dados chegam pelo MqttProvider, que assina o HiveMQ Cloud no
// namespace `aquasense-ibmec-pt` e empurra cada amostra (payload `.../dados`)
// para `ingestFromMqtt()`. Se o ESP32 ficar > 15 s sem publicar, o provider
// liga `_start()` para rodar a simulação local como fallback (banner discreto
// avisa o usuário). O controle real da bomba (histerese ΔT 5°C/1°C com
// anti-cycling de 60 s) acontece no firmware embarcado — o dashboard apenas
// reflete o estado.
//
// Este arquivo é o ORQUESTRADOR: monta o estado inicial e expõe as ações. A
// lógica de domínio vive em módulos focados, todos testáveis isoladamente:
//   - alertEngine.ts       máquina de estado dos alertas agregados
//   - cloroEvents.ts       detecção de cruzamento de faixa do cloro
//   - simulationEngine.ts  tick da simulação local (fallback)
//   - settings.ts          persistência de preferências (localStorage)
//   - initialState.ts      montagem do estado inicial (seed + preferências)

import { create } from "zustand";
import type { ParameterKey, PoolState, PumpMode, SensorPoint } from "@/types/aquasense";
import type { AquaSenseData } from "@/types/firmware";
import { isSensorError } from "@/types/firmware";
import { clamp } from "@/lib/simulation";
import { aggregateStatus } from "@/lib/thresholds";
import { SIM, POOL } from "@/lib/constants";
import { processAggregatedAlertsWithStats, type ParamReading } from "@/store/alertEngine";
import { detectChlorineEvent } from "@/store/cloroEvents";
import { saveSettings } from "@/store/settings";
import { buildInitial } from "@/store/initialState";
import { runSimulationTick } from "@/store/simulationEngine";

export interface Store extends PoolState {
  // ações
  setSetpoint: (v: number) => void;
  setMode: (m: PumpMode) => void;
  setDosingMode: (m: PumpMode) => void;
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

export const usePoolStore = create<Store>((set, get) => ({
  ...buildInitial(),
  sessionAlertsOpened: 0,
  sessionAlertsEscalated: 0,
  sessionAlertsResolved: 0,
  ultimaDosePorProduto: { cloro: null, acido: null, base: null },
  doseTimestamps: [],
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
  setDosingMode: (m) => {
    saveSettings({ dosagem_modo: m });
    set({ dosagem_modo: m });
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
        {
          t: now,
          ligada: newState,
          motivo: `Manual: usuário ${newState ? "LIGOU" : "DESLIGOU"} a bomba`,
        },
        ...s.pumpLog,
      ].slice(0, POOL.PUMP_LOG_MAX),
    });
  },
  acknowledgeAlert: (id) => {
    const s = get();
    const now = Date.now();
    const next = s.alerts.map((a) =>
      a.id === id && a.status === "ativo" && a.ack_em == null ? { ...a, ack_em: now } : a,
    );
    saveSettings({
      ackedAlerts: next.filter((a) => a.ack_em != null && a.status === "ativo").map((a) => a.id),
    });
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
    const delta_t = typeof tp.delta_T === "number" ? tp.delta_T : temp_coletor - temp_piscina;
    const bomba_ligada = ctrl.bomba === "LIGADA";
    // Estado de controle do firmware é autoritativo quando presente: reflete o
    // modo e a parada de emergência (ex.: acionada pela Alexa) na UI.
    const parada_emergencia = ctrl.parada_emergencia === true;
    const bomba_modo = ctrl.modo ?? s.bomba_modo;
    const dosagem_modo = ctrl.modo_dosagem ?? s.dosagem_modo;

    // pumpLog: registra mudança de estado da bomba reportada pelo ESP32
    let pumpLog = s.pumpLog;
    let ultima_mudanca = s.ultima_mudanca_bomba_t;
    let estado_desde = s.bomba_estado_desde_t;
    if (bomba_ligada !== s.bomba_ligada) {
      ultima_mudanca = now;
      estado_desde = now;
      pumpLog = [
        {
          t: now,
          ligada: bomba_ligada,
          motivo: `ESP32 (auto): ΔT ${delta_t.toFixed(1)}°C → ${bomba_ligada ? "LIGAR" : "DESLIGAR"}`,
        },
        ...pumpLog,
      ].slice(0, POOL.PUMP_LOG_MAX);
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
    const validPoint =
      !isSensorError(temp_piscina) &&
      !isSensorError(temp_coletor) &&
      !isSensorError(ph) &&
      !isSensorError(cloro) &&
      !isSensorError(alcalinidade);
    let liveHistory = s.liveHistory;
    let history = s.history;
    if (validPoint) {
      const point: SensorPoint = {
        t: now,
        ph,
        cloro,
        alcalinidade,
        temp_piscina,
        temp_coletor,
        bomba_ligada,
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
      ph,
      cloro,
      alcalinidade,
      temp_piscina,
      temp_coletor,
      delta_t,
      bomba_ligada,
      bomba_modo,
      dosagem_modo,
      parada_emergencia,
      ultima_mudanca_bomba_t: ultima_mudanca,
      bomba_estado_desde_t: estado_desde,
      pumpLog,
      liveHistory,
      history,
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

  // Liga a simulação local (fallback). O tick puro vive em simulationEngine.ts;
  // aqui só cuidamos do agendamento (setInterval) e da guarda de re-entrada.
  _start: () => {
    if (get()._started || typeof window === "undefined") return;
    set({ _started: true });

    const id = setInterval(() => {
      try {
        set(runSimulationTick(get()));
      } catch (err) {
        console.error("[AquaSense] simulation tick failed:", err);
      }
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
