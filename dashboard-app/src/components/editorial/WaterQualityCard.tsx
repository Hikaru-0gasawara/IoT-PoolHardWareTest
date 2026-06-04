import { AlertOctagon, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { THRESHOLDS, statusFor, statusColor } from "@/lib/thresholds";
import type { ParameterKey } from "@/types/aquasense";

// Card editorial de qualidade da água — número grande tipo display, slider
// posicional dentro da faixa, drift vs 1h e linha descritiva curta.
// Tratamento especial:
//   - sensorError (incl. cloroEmErro)  → bloco "Sensor sem resposta"
//   - dosing             → pílula "● dosando" sem competir com status
//   - estopActive        → reduz opacidade e suprime drift (sistema travado)

interface Props {
  paramKey: ParameterKey;
  value: number;
  diff: number;
  sensorError: boolean;
  dosing: boolean;
  estopActive: boolean;
  loading: boolean;
  // Série recente (mais antigo → mais novo) para o mini-histórico e a seta.
  trend?: number[];
}

// Mini sparkline + seta de tendência baseada na inclinação das últimas leituras.
function TrendIndicator({ series, decimals }: { series: number[]; decimals: number }) {
  if (series.length < 2) return null;

  const min = Math.min(...series);
  const max = Math.max(...series);
  const span = max - min || 1;
  const w = 48;
  const h = 16;
  const pts = series
    .map((v, i) => {
      const x = (i / (series.length - 1)) * w;
      const y = h - ((v - min) / span) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const delta = series[series.length - 1] - series[0];
  const eps = span * 0.04;
  const dir: "up" | "down" | "flat" = delta > eps ? "up" : delta < -eps ? "down" : "flat";
  const color =
    dir === "up" ? "var(--status-warn)" : dir === "down" ? "var(--aqua-accent)" : "var(--aqua-text-muted)";
  const Arrow = dir === "up" ? TrendingUp : dir === "down" ? TrendingDown : Minus;
  const dirLabel = dir === "up" ? "subindo" : dir === "down" ? "caindo" : "estável";

  return (
    <span
      className="inline-flex items-center gap-1.5 self-end"
      title={`Tendência ${dirLabel} (${delta >= 0 ? "+" : ""}${delta.toFixed(decimals)} nas últimas leituras)`}
      aria-label={`Tendência ${dirLabel}`}
    >
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible" aria-hidden>
        <polyline
          points={pts}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <Arrow className="h-3.5 w-3.5" style={{ color }} aria-hidden />
    </span>
  );
}

const DRIFT_COPY: Record<ParameterKey, { up: string; down: string; flat: string }> = {
  ph: {
    up: "Tendendo a alcalino — observe nas próximas leituras.",
    down: "Tendendo a ácido — observe nas próximas leituras.",
    flat: "Estável dentro da faixa do firmware.",
  },
  cloro: {
    up: "Cloro subindo — maior poder de desinfecção.",
    down: "Cloro caindo — desinfecção enfraquecendo.",
    flat: "Cloro estável — desinfecção adequada.",
  },
  alcalinidade: {
    up: "Alcalinidade subindo — buffer aumentando.",
    down: "Alcalinidade caindo — buffer diminuindo.",
    flat: "Alcalinidade estável.",
  },
  temp_piscina: {
    up: "Aquecendo — ganho solar efetivo.",
    down: "Resfriando — sem ganho solar recente.",
    flat: "Temperatura estável.",
  },
  temp_coletor: {
    up: "Coletor aquecendo.",
    down: "Coletor resfriando.",
    flat: "Coletor estável.",
  },
};


export function WaterQualityCard({ paramKey, value, diff, sensorError, dosing, estopActive, loading, trend }: Props) {
  const t = THRESHOLDS[paramKey];
  const status = sensorError ? "crit" : statusFor(paramKey, value);
  const sColor = statusColor(status);
  const decimals = paramKey === "ph" ? 2 : paramKey === "cloro" ? 1 : paramKey === "alcalinidade" ? 0 : 1;
  const pos = Math.max(2, Math.min(98, ((value - t.rangeMin) / (t.rangeMax - t.rangeMin)) * 100));

  const drift = DRIFT_COPY[paramKey];
  const driftCopy =
    sensorError ? "Aguardando leitura válida do sensor."
    : Math.abs(diff) < (t.idealMax - t.idealMin) * 0.05 ? drift.flat
    : diff > 0 ? drift.up
    : drift.down;

  if (loading) {
    return (
      <article className="rounded-2xl border border-aqua-border bg-aqua-surface p-5">
        <div className="text-label">{t.label}</div>
        <div className="text-display-large mt-2 text-aqua-text-muted opacity-60">—</div>
        <p className="mt-3 text-xs text-aqua-text-muted">Aguardando primeiro ciclo do ESP32…</p>
      </article>
    );
  }

  return (
    <article
      tabIndex={0}
      className={[
        "group tile-interactive rounded-2xl border bg-aqua-surface p-5 shadow-sm cursor-default",
        "transition-all duration-200 ease-out",
        "hover:-translate-y-0.5 hover:shadow-lg",
        "active:translate-y-0 active:shadow-sm active:scale-[0.99]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-aqua-bg",
        status === "crit" ? "tile-alert-crit" : status === "warn" ? "tile-alert-warn" : "",
      ].join(" ")}
      style={{
        borderColor: status === "ok" ? "var(--aqua-border)" : sColor,
        opacity: estopActive ? 0.7 : 1,
        ["--tile-glow" as string]: status === "ok" ? "var(--aqua-accent)" : sColor,
        ["--tw-ring-color" as string]: status === "ok" ? "var(--aqua-accent)" : sColor,
      }}
      aria-label={`${t.label}: ${sensorError ? "sensor com erro" : value.toFixed(decimals) + (t.unit ? " " + t.unit : "")}`}
    >
      <header className="flex items-center justify-between">
        <div className="text-label" style={{ color: sColor }}>{t.label}</div>
        {dosing && !estopActive && (
          <span className="inline-flex items-center gap-1 rounded-full border border-aqua-accent/40 bg-aqua-accent/10 px-2 py-0.5 text-[10px] font-medium text-aqua-accent">
            ● dosando
          </span>
        )}
        {estopActive && (
          <span className="inline-flex items-center gap-1 rounded-full border border-status-crit/40 bg-status-crit/10 px-2 py-0.5 text-[10px] font-medium text-status-crit">
            travado
          </span>
        )}
      </header>

      <div className="mt-2 flex items-baseline justify-between gap-1.5">
        {sensorError ? (
          <span className="text-display-large text-status-crit inline-flex items-center gap-2">
            <AlertOctagon className="h-7 w-7" aria-hidden /> ERRO
          </span>
        ) : (
          <>
            <span className="flex items-baseline gap-1.5">
              <span className="text-display-large text-aqua-text">{value.toFixed(decimals)}</span>
              {t.unit && <span className="text-sm text-aqua-text-muted">{t.unit}</span>}
            </span>
            {!estopActive && trend && <TrendIndicator series={trend} decimals={decimals} />}
          </>
        )}
      </div>

      {!sensorError && (
        <div className="mt-4 space-y-1" aria-hidden>
          <div className="relative h-1.5 overflow-hidden rounded-full bg-aqua-surface-2">
            <div
              className="absolute inset-y-0 rounded-full"
              style={{
                left: `${((t.idealMin - t.rangeMin) / (t.rangeMax - t.rangeMin)) * 100}%`,
                width: `${((t.idealMax - t.idealMin) / (t.rangeMax - t.rangeMin)) * 100}%`,
                backgroundColor: "var(--status-ok)",
                opacity: 0.55,
              }}
            />
            <div
              className="absolute top-1/2 h-3 w-1 -translate-y-1/2 rounded-full"
              style={{ left: `calc(${pos}% - 2px)`, backgroundColor: t.color }}
            />
          </div>
          <div className="flex justify-between text-[10px] font-tabular text-aqua-text-muted/70">
            <span>{t.rangeMin}</span>
            <span>{t.idealMin}–{t.idealMax} ideal</span>
            <span>{t.rangeMax}</span>
          </div>
        </div>
      )}

      <p className="mt-3 text-xs leading-relaxed text-aqua-text-muted">
        {!sensorError && !estopActive && (
          <span className="mr-1.5 font-tabular text-aqua-text">
            Δ {diff >= 0 ? "+" : ""}{diff.toFixed(decimals)}
            <span className="text-aqua-text-muted/70"> /1h</span>
          </span>
        )}
        {driftCopy}
      </p>
    </article>
  );
}
