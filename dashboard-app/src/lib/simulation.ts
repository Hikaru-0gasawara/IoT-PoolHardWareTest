// Engine de simulação física do AquaSense.
// Roda apenas no provider — NUNCA dentro de componentes.

import type { SensorPoint } from "@/types/aquasense";
import { SIM, CHLORINE } from "@/lib/constants";

// Padrão diurno do coletor solar (interpolação por hora)
const SOLAR_CURVE: Array<[number, number]> = [
  [0, 19], [3, 18], [6, 20], [9, 30], [12, 55],
  [13, 65], [15, 58], [16, 50], [18, 38], [19, 32],
  [21, 26], [22, 22], [24, 19],
];

export function solarBaseTempAt(date: Date): number {
  const h = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
  for (let i = 0; i < SOLAR_CURVE.length - 1; i++) {
    const [h1, t1] = SOLAR_CURVE[i];
    const [h2, t2] = SOLAR_CURVE[i + 1];
    if (h >= h1 && h <= h2) {
      const k = (h - h1) / (h2 - h1);
      return t1 + (t2 - t1) * k;
    }
  }
  return 22;
}

// Ruído gaussiano leve
function noise(amp: number): number {
  return (Math.random() - 0.5) * 2 * amp;
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

// Próximo valor da temperatura da piscina (grande inércia térmica)
export function nextPoolTemp(prev: number, bombaOn: boolean, deltaT: number, hour: number): number {
  let next = prev;
  if (bombaOn && deltaT > 0) {
    next += 0.05 * Math.min(deltaT / 5, 1.5); // ganho proporcional, limitado
  } else {
    // perda térmica natural — pior à noite
    const nightFactor = hour < 6 || hour > 20 ? 1.5 : 1;
    next -= 0.02 * nightFactor;
  }
  next += noise(0.05);
  return clamp(next, 20, 38);
}

// Random walk com viés para o centro da faixa ideal (7.4).
// Mantém o sistema "tudo OK" como estado dominante. A piscina real é assim:
// um piscineiro decente mantém o pH centrado e excursões são eventos.
export function nextPh(prev: number): number {
  const center = 7.4;
  const meanReversion = (center - prev) * 0.05; // puxa devagar para o centro
  const next = prev + meanReversion + noise(0.015);
  return clamp(next, 7.15, 7.65);
}

// Cloro — degradação por UV + dosagem periódica, com viés para o centro
// da faixa ideal (2.0 ppm). Dose só dispara quando cloro caiu abaixo de
// ~1.4 ppm — evita o pico para 4+ ppm que mantinha alerta crítico permanente.
export function nextCloro(prev: number, hour: number, ticksSinceDose: number): { value: number; dosed: boolean } {
  let next = prev;
  const center = 2.0;
  const meanReversion = (center - prev) * 0.01;
  // degradação por UV (pior no meio-dia) — mais branda
  const uv = Math.max(0, Math.cos(((hour - 13) / 12) * Math.PI));
  next += meanReversion;
  next -= uv * 0.003 + 0.0005;
  next += noise(0.01);
  let dosed = false;
  // Dosagem condicional: só repõe se cloro está realmente baixo. Mantém o
  // intervalo mínimo do cronograma para não dosar a cada tick.
  if (ticksSinceDose >= CHLORINE.DOSE_INTERVAL_TICKS && next < 1.4) {
    next += CHLORINE.DOSE_AMOUNT;
    dosed = true;
  }
  return { value: clamp(next, 0.8, 3.2), dosed };
}

export function nextOrp(prev: number): number {
  const next = prev + noise(8);
  return clamp(next, 620, 780);
}

export function nextAlcalinidade(prev: number): number {
  const next = prev + noise(0.5);
  return clamp(next, 85, 110);
}

// Próxima temperatura do coletor com nuvens ocasionais
export function nextSolarTemp(prev: number, date: Date, cloudTicksLeft: number): { value: number; cloudLeft: number } {
  const base = solarBaseTempAt(date);
  // Aproxima do alvo com inércia leve
  let target = base + noise(0.5);
  let cloudLeft = cloudTicksLeft;
  if (cloudLeft > 0) {
    target -= 8;
    cloudLeft -= 1;
  } else if (Math.random() < 0.005 && date.getHours() >= 8 && date.getHours() <= 18) {
    cloudLeft = 2 + Math.floor(Math.random() * 2);
  }
  const next = prev + (target - prev) * 0.35;
  return { value: clamp(next, 14, 75), cloudLeft };
}

// Lógica de histerese ΔT 5/1 com anti-cycling de 60s
export interface PumpDecisionInput {
  bombaOn: boolean;
  deltaT: number;
  modo: "automatico" | "manual";
  agora: number;
  ultimaMudanca: number;
}

export function decidePump(input: PumpDecisionInput): { newState: boolean; reason: string; canChange: boolean } {
  const elapsed = (input.agora - input.ultimaMudanca) / 1000;
  const canChange = elapsed >= SIM.ANTI_CYCLING_S;

  if (input.modo === "manual") {
    return { newState: input.bombaOn, reason: "Modo manual", canChange };
  }

  // automático
  let target = input.bombaOn;
  let reason = `Mantém estado (ΔT ${input.deltaT.toFixed(1)}°C na zona morta 1–5°C)`;

  if (input.deltaT >= 5) {
    target = true;
    reason = `Auto: ΔT ${input.deltaT.toFixed(1)}°C ≥ 5°C → LIGAR`;
  } else if (input.deltaT <= 1) {
    target = false;
    reason = `Auto: ΔT ${input.deltaT.toFixed(1)}°C ≤ 1°C → DESLIGAR`;
  }

  if (target !== input.bombaOn && !canChange) {
    return { newState: input.bombaOn, reason: `Anti-cycling (${(SIM.ANTI_CYCLING_S - elapsed).toFixed(0)}s)`, canChange: false };
  }

  return { newState: target, reason, canChange };
}

// Gera seed das últimas 24h em granularidade de 5min (288 pontos)
export function seedHistory(now: Date): SensorPoint[] {
  const points: SensorPoint[] = [];
  const STEP_MS = 5 * 60 * 1000;
  const N = 288;
  let ph = 7.4;
  let cloro = 2.1;
  let alc = 95;
  let pool = 28.7;
  let solar = solarBaseTempAt(new Date(now.getTime() - N * STEP_MS));
  let bomba = false;
  let lastChange = now.getTime() - N * STEP_MS;

  for (let i = N; i >= 0; i--) {
    const t = now.getTime() - i * STEP_MS;
    const d = new Date(t);
    const base = solarBaseTempAt(d);
    solar = solar + (base - solar) * 0.5 + (Math.random() - 0.5) * 1.2;
    solar = clamp(solar, 14, 72);
    const dt = solar - pool;
    // histerese simplificada para o seed
    if (dt >= 5 && t - lastChange > 60_000 && !bomba) { bomba = true; lastChange = t; }
    else if (dt <= 1 && t - lastChange > 60_000 && bomba) { bomba = false; lastChange = t; }
    pool = nextPoolTemp(pool, bomba, dt, d.getHours());
    ph = nextPh(ph);
    cloro = clamp(cloro - 0.001 + (Math.random() - 0.5) * 0.04, 0.5, 4);
    if (i % (12 * 6) === 0) cloro += 0.8; // dosagem aprox a cada 6h
    alc = nextAlcalinidade(alc);

    points.push({
      t,
      ph: Number(ph.toFixed(2)),
      cloro: Number(cloro.toFixed(2)),
      alcalinidade: Number(alc.toFixed(1)),
      temp_piscina: Number(pool.toFixed(2)),
      temp_coletor: Number(solar.toFixed(2)),
      bomba_ligada: bomba,
    });
  }

  return points;
}
