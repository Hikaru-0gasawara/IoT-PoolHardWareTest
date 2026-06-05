// Engine de simulação física do AquaSense.
// Roda apenas no provider — NUNCA dentro de componentes.

import type { SensorPoint } from "@/types/aquasense";
import { SIM } from "@/lib/constants";

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
export function nextPh(prev: number): number {
  const center = 7.4;
  const meanReversion = (center - prev) * 0.05; // puxa devagar para o centro
  const next = prev + meanReversion + noise(0.015);
  return clamp(next, 7.15, 7.65);
}

// ─────────────────────────────────────────────────────────────────────
// Conversão ADC → unidade real (alinhada ao firmware ESP32, 12 bits / 3.3 V).
// O ESP32 lê uma tensão analógica e converte para a grandeza física antes de
// publicar. Aqui replicamos essa conversão para que a simulação trabalhe a
// partir do ADC bruto e exponha os MESMOS valores convertidos do firmware.
// ─────────────────────────────────────────────────────────────────────
export const ADC_MAX = 4095; // resolução de 12 bits do ESP32
export const ADC_VREF = 3.3; // tensão de referência

export function adcToVoltage(adc: number): number {
  return (clamp(adc, 0, ADC_MAX) * ADC_VREF) / ADC_MAX;
}

// Sonda ORP analógica: orp(mV) = 1320 - 1000 * V (offset/ganho padrão DFRobot).
export function orpFromAdc(adc: number): number {
  return 1320 - 1000 * adcToVoltage(adc);
}

export function orpToAdc(orpMv: number): number {
  const voltage = (1320 - orpMv) / 1000;
  return clamp((voltage / ADC_VREF) * ADC_MAX, 0, ADC_MAX);
}

// Sensor TDS/condutividade (Gravity TDS): polinômio tensão → µS/cm a 25 °C.
export function condFromAdc(adc: number): number {
  const v = adcToVoltage(adc);
  return 133.42 * v * v * v - 255.86 * v * v + 857.39 * v;
}

// Inverso numérico (curva monótona em [0, ~2.4] V) por bisseção.
export function condToAdc(condUs: number): number {
  let lo = 0;
  let hi = ADC_MAX;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (condFromAdc(mid) < condUs) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// Cloro (ppm) — random walk com viés para o centro da faixa ideal (2.0 ppm).
export function nextCloro(prev: number): number {
  const center = 2.0;
  const meanReversion = (center - prev) * 0.03;
  const next = prev + meanReversion + noise(0.08);
  return clamp(next, 0.2, 6.0);
}

// Alcalinidade (ppm) — random walk com viés para o centro da faixa ideal (100 ppm).
export function nextAlcalinidade(prev: number): number {
  const center = 100;
  const meanReversion = (center - prev) * 0.02;
  const next = prev + meanReversion + noise(2);
  return clamp(next, 40, 160);
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
import type { PumpMode } from "@/types/aquasense";

export interface PumpDecisionInput {
  bombaOn: boolean;
  deltaT: number;
  modo: PumpMode;
  agora: number;
  ultimaMudanca: number;
}

export function decidePump(input: PumpDecisionInput): { newState: boolean; reason: string; canChange: boolean } {
  const elapsed = (input.agora - input.ultimaMudanca) / 1000;
  const canChange = elapsed >= SIM.ANTI_CYCLING_S;

  if (input.modo === "parado") {
    return { newState: false, reason: "Sistema parado — bomba desativada", canChange };
  }
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
  let cloro = 2.0;
  let alcalinidade = 100;
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
    cloro = nextCloro(cloro);
    alcalinidade = nextAlcalinidade(alcalinidade);

    points.push({
      t,
      ph: Number(ph.toFixed(2)),
      cloro: Number(cloro.toFixed(1)),
      alcalinidade: Number(alcalinidade.toFixed(0)),
      temp_piscina: Number(pool.toFixed(2)),
      temp_coletor: Number(solar.toFixed(2)),
      bomba_ligada: bomba,
    });
  }

  return points;
}
