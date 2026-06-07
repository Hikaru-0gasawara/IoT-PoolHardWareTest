// Engine de simulação local — extraída do poolStore.
//
// `runSimulationTick` é uma função PURA: recebe o estado atual do store e
// devolve o patch (`Partial<Store>`) a ser aplicado via `set()`. Roda a cada
// SIM.TICK_MS quando o ESP32 fica > 15 s sem publicar (fallback). Mantém o
// comportamento idêntico ao tick que vivia inline no poolStore — apenas isolado
// e testável sem o setInterval.

import {
  decidePump,
  nextCloro,
  nextAlcalinidade,
  nextPh,
  nextPoolTemp,
  nextSolarTemp,
} from "@/lib/simulation";
import { aggregateStatus } from "@/lib/thresholds";
import { SIM, POOL } from "@/lib/constants";
import { processAggregatedAlertsWithStats, type ParamReading } from "@/store/alertEngine";
import { detectChlorineEvent } from "@/store/cloroEvents";
import type { Store } from "@/store/poolStore";

export function runSimulationTick(s: Store): Partial<Store> {
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
    pumpLog = [{ t: now, ligada: bomba_ligada, motivo: decision.reason }, ...pumpLog].slice(
      0,
      POOL.PUMP_LOG_MAX,
    );
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
  const live = [
    ...s.liveHistory,
    {
      t: now,
      ph,
      cloro,
      alcalinidade,
      temp_piscina,
      temp_coletor,
      bomba_ligada,
    },
  ].slice(-SIM.LIVE_HISTORY_MAX);

  // Update history (5min) — só adiciona quando passa STEP_MS
  let history = s.history;
  const lastH = history[history.length - 1];
  if (!lastH || now - lastH.t >= SIM.HISTORY_STEP_MS) {
    history = [
      ...history,
      {
        t: now,
        ph,
        cloro,
        alcalinidade,
        temp_piscina,
        temp_coletor,
        bomba_ligada,
      },
    ].slice(-SIM.HISTORY_MAX);
  }

  const status_geral = aggregateStatus({ ph, cloro, alcalinidade, temp_piscina });

  // Eventos discretos de cruzamento de faixa do Cloro (1.0–3.0 ppm).
  const cloroEvt = detectChlorineEvent(s.cloro, cloro, now);
  const cloroEvents = cloroEvt
    ? [cloroEvt, ...s.cloroEvents].slice(0, POOL.CLORO_EVENT_MAX)
    : s.cloroEvents;

  return {
    ph,
    cloro,
    alcalinidade,
    temp_piscina,
    temp_coletor,
    delta_t,
    bomba_ligada,
    ultima_mudanca_bomba_t: ultima_mudanca,
    bomba_estado_desde_t: estado_desde,
    pumpLog,
    liveHistory: live,
    history,
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
  };
}
