import type { ParameterKey, StatusLevel, Thresholds } from "@/types/aquasense";

// Faixas ABNT NBR 10818 — fonte única de verdade.
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
    label: "Cloro livre",
    unit: "ppm",
    idealMin: 1.0,
    idealMax: 3.0,
    warnMin: 0.6,
    warnMax: 4.0,
    rangeMin: 0,
    rangeMax: 10,
    color: "var(--param-cloro)",
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
    color: "var(--param-alc)",
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
