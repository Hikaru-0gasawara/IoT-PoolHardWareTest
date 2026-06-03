import type { ParameterKey, StatusLevel, Thresholds } from "@/types/aquasense";

// Faixas alinhadas ao firmware v2.3 — fonte única de verdade.
// pH 7.2–7.6 | ORP 650–750 mV | condutividade 800–1500 µS/cm.
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
  orp: {
    label: "ORP",
    unit: "mV",
    idealMin: 650,
    idealMax: 750,
    warnMin: 600,
    warnMax: 800,
    rangeMin: 400,
    rangeMax: 1000,
    color: "var(--param-orp)",
  },
  condutividade: {
    label: "Condutividade",
    unit: "µS/cm",
    idealMin: 800,
    idealMax: 1500,
    warnMin: 600,
    warnMax: 1800,
    rangeMin: 0,
    rangeMax: 2500,
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
