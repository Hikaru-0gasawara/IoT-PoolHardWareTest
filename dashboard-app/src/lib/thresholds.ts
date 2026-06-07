import type { ParameterKey, StatusLevel, Thresholds } from "@/types/aquasense";
import { isSensorError, type WaterStatus } from "@/types/firmware";

// Faixas alinhadas ao firmware v3.1 — fonte única de verdade.
// pH 7.2–7.6 | cloro 1.0–3.0 ppm | alcalinidade 80–120 ppm.
export const THRESHOLDS: Record<ParameterKey, Thresholds> = {
  ph: {
    label: "pH",
    unit: "",
    idealMin: 7.2,
    idealMax: 7.6,
    warnMin: 7.0,
    warnMax: 7.8,
    rangeMin: 0,
    rangeMax: 14,
    color: "var(--param-ph)",
  },
  cloro: {
    label: "Cloro",
    unit: "ppm",
    idealMin: 1.0,
    idealMax: 3.0,
    warnMin: 0.5,
    warnMax: 5.0,
    rangeMin: 0,
    rangeMax: 10,
    color: "var(--param-orp)",
  },
  alcalinidade: {
    label: "Alcalinidade",
    unit: "ppm",
    idealMin: 80,
    idealMax: 120,
    warnMin: 60,
    warnMax: 150,
    rangeMin: 0,
    rangeMax: 200,
    color: "var(--param-cond)",
  },
  temp_piscina: {
    label: "Temp. Piscina",
    unit: "°C",
    idealMin: 27,
    idealMax: 35,
    warnMin: 25,
    warnMax: 37,
    rangeMin: 15,
    rangeMax: 45,
    color: "var(--param-pool)",
  },
  temp_coletor: {
    label: "Temp. Coletor",
    unit: "°C",
    idealMin: 15,
    idealMax: 80,
    warnMin: 15,
    warnMax: 80,
    rangeMin: 15,
    rangeMax: 80,
    color: "var(--param-solar)",
  },
};

export function statusFor(key: ParameterKey, value: number): StatusLevel {
  const t = THRESHOLDS[key];
  if (key === "temp_coletor") return "ok"; // referência ambiental
  if (value < t.warnMin || value > t.warnMax) return "crit";
  if (value < t.idealMin || value > t.idealMax) return "warn";
  return "ok";
}

// Status DIRECIONAL (OK/BAIXO/ALTO) — diferente de statusFor (severidade
// ok/warn/crit). É o vocabulário do firmware para qualidade_agua.*_status, usado
// no parse do snapshot MQTT e no fallback simulado. Deriva os limites da faixa
// IDEAL de THRESHOLDS (fonte única), evitando repetir 7.2/7.6, 1.0/3.0, 80/120.
// Leitura de erro de sensor (-99) vira OK; a UI sinaliza o erro à parte.
export function waterStatusFor(key: ParameterKey, value: number): WaterStatus {
  if (isSensorError(value)) return "OK";
  const t = THRESHOLDS[key];
  if (value < t.idealMin) return "BAIXO";
  if (value > t.idealMax) return "ALTO";
  return "OK";
}

export function aggregateStatus(values: Partial<Record<ParameterKey, number>>): StatusLevel {
  let worst: StatusLevel = "ok";
  (Object.keys(values) as ParameterKey[]).forEach((k) => {
    const s = statusFor(k, values[k] as number);
    if (s === "crit") worst = "crit";
    else if (s === "warn" && worst !== "crit") worst = "warn";
  });
  return worst;
}

export function statusColor(s: StatusLevel): string {
  if (s === "crit") return "var(--status-crit)";
  if (s === "warn") return "var(--status-warn)";
  return "var(--status-ok)";
}

export function statusLabel(s: StatusLevel): string {
  if (s === "crit") return "Ação Necessária";
  if (s === "warn") return "Atenção";
  return "Tudo OK";
}
