// Funções puras para tooltip e descrição acessível dos sparklines dos
// ParameterCards. Separadas do componente para serem testáveis sem montar
// Recharts (que depende de eventos reais de mousemove em SVG).

import type { ParameterKey } from "@/types/aquasense";
import { isSensorError } from "@/types/firmware";
import { THRESHOLDS, statusFor } from "@/lib/thresholds";

export interface TooltipLines {
  valueLine: string;
  timeLine: string;
}

function decimalsFor(paramKey: ParameterKey): number {
  if (paramKey === "ph") return 2;
  if (paramKey === "orp") return 0;
  if (paramKey === "condutividade") return 0;
  return 1; // temperaturas
}

function unitSuffix(paramKey: ParameterKey): string {
  const u = THRESHOLDS[paramKey].unit;
  return u ? ` ${u}` : "";
}

// Tempo relativo ajustado para janela de sparkline (≤ 2h). Difere do
// formatAge() do mqttStatus porque queremos "agora mesmo" abaixo de 10s e
// "há N min" com espaço, conforme spec do tooltip.
export function formatRelativeTime(ageMs: number): string {
  if (ageMs < 10_000) return "agora mesmo";
  const totalSec = Math.floor(ageMs / 1000);
  if (totalSec < 60) return `há ${totalSec}s`;
  const totalMin = Math.floor(totalSec / 60);
  if (totalMin < 60) return `há ${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  return `há ${h}h`;
}

export function formatTooltipContent(
  point: { v: number; t: number },
  paramKey: ParameterKey,
  now: number,
): TooltipLines {
  if (!Number.isFinite(point.v) || isSensorError(point.v)) {
    return { valueLine: "ERRO", timeLine: "—" };
  }
  const d = decimalsFor(paramKey);
  const valueLine = `${point.v.toFixed(d)}${unitSuffix(paramKey)}`;
  const ageMs = Math.max(0, now - point.t);
  return { valueLine, timeLine: formatRelativeTime(ageMs) };
}

// Descrição resumida da tendência para aria-label do card. A sparkline em si
// fica aria-hidden — o leitor de tela recebe um resumo no card pai.
export type TrendDescription =
  | "estável"
  | "subindo"
  | "descendo"
  | "oscilando"
  | "sem histórico"
  | "preliminar";

export function describeTrend(values: number[], paramKey: ParameterKey): TrendDescription {
  const clean = values.filter((v) => Number.isFinite(v) && !isSensorError(v));
  if (clean.length < 3) return "sem histórico";
  // 3-5 pontos: amostra muito curta (pode ser reconexão MQTT recente — ~15s
  // de dado). Não é honesto rotular como "tendência das últimas 2h".
  if (clean.length < 6) return "preliminar";

  const t = THRESHOLDS[paramKey];
  const idealAmplitude = Math.max(1e-6, t.idealMax - t.idealMin);
  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const variation = max - min;

  // < 5% da amplitude da faixa ideal = estável.
  if (variation < idealAmplitude * 0.05) return "estável";

  const first = clean[0];
  const last = clean[clean.length - 1];
  const netDelta = last - first;
  const monotonicityThreshold = variation * 0.6;

  if (netDelta > monotonicityThreshold) return "subindo";
  if (-netDelta > monotonicityThreshold) return "descendo";
  return "oscilando";
}

function statusPhrase(paramKey: ParameterKey, value: number): string {
  if (isSensorError(value)) return "erro de sensor";
  const s = statusFor(paramKey, value);
  if (s === "ok") return "dentro da faixa ideal";
  if (s === "warn") return "em atenção";
  return "crítico";
}

export function buildCardAriaLabel(
  paramKey: ParameterKey,
  value: number,
  history: number[],
): string {
  const t = THRESHOLDS[paramKey];
  const d = decimalsFor(paramKey);
  const unit = t.unit ? ` ${t.unit}` : "";
  if (isSensorError(value)) {
    return `${t.label}: erro de sensor.`;
  }
  const trend = describeTrend(history, paramKey);
  const status = statusPhrase(paramKey, value);
  const trendPhrase =
    trend === "sem histórico"
      ? "sem histórico suficiente"
      : trend === "preliminar"
        ? "histórico recente, tendência preliminar"
        : `${trend} nas últimas 2 horas`;
  return `${t.label}: ${value.toFixed(d)}${unit}, ${status}, ${trendPhrase}.`;
}