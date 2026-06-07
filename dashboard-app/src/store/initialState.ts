// Estado inicial do poolStore — extraído para isolar a montagem (seed do
// histórico + leitura das preferências persistidas) da lógica do store.

import type { AggregatedAlert, PoolState, SensorPoint } from "@/types/aquasense";
import { seedHistory } from "@/lib/simulation";
import { loadSettings } from "@/store/settings";

export function buildInitial(): PoolState {
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
    dosagem_modo: persisted.dosagem_modo ?? "automatico",
    setpoint_temp: persisted.setpoint_temp ?? 30,
    ultima_mudanca_bomba_t: now.getTime() - 1000 * 60 * 12,
    bomba_estado_desde_t: now.getTime() - 1000 * 60 * 12,
    parada_emergencia: false,
    status_geral: "ok",
    ultima_atualizacao_t: now.getTime(),
    uptime_s: 3600 * 26,
    firmware: "v1.2.3-aquasense",
    history: seed,
    liveHistory: live,
    pumpLog: [
      { t: now.getTime() - 1000 * 60 * 12, ligada: true, motivo: "Auto: ΔT 8.2°C ≥ 5°C → LIGAR" },
      {
        t: now.getTime() - 1000 * 60 * 95,
        ligada: false,
        motivo: "Auto: ΔT 0.4°C ≤ 1°C → DESLIGAR",
      },
      { t: now.getTime() - 1000 * 60 * 130, ligada: true, motivo: "Auto: ΔT 6.1°C ≥ 5°C → LIGAR" },
    ],
    alerts: initialAlerts,
    cloroEvents: [],
    lastTickAt: now.getTime(),
  };
}
