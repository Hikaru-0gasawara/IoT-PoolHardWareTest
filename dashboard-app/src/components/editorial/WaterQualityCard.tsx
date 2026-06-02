import { AlertOctagon } from "lucide-react";
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
}

const DRIFT_COPY: Record<ParameterKey, { up: string; down: string; flat: string }> = {
  ph: {
    up: "Tendendo a alcalino — observe nas próximas leituras.",
    down: "Tendendo a ácido — observe nas próximas leituras.",
    flat: "Estável dentro da faixa ABNT NBR 10818.",
  },
  cloro: {
    up: "Cloro subindo — consumo baixo nas últimas horas.",
    down: "Cloro caindo — consumo aumentou ou exposição solar.",
    flat: "Cloro residual estável.",
  },
  alcalinidade: {
    up: "Alcalinidade subindo — efeito tampão fortalecendo.",
    down: "Alcalinidade caindo — pH ficará mais sensível.",
    flat: "Alcalinidade estável — bom efeito tampão.",
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

export function WaterQualityCard({ paramKey, value, diff, sensorError, dosing, estopActive, loading }: Props) {
  const t = THRESHOLDS[paramKey];
  const status = sensorError ? "crit" : statusFor(paramKey, value);
  const sColor = statusColor(status);
  const decimals = paramKey === "alcalinidade" ? 0 : paramKey === "ph" ? 2 : 1;
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
      className="rounded-2xl border bg-aqua-surface p-5 shadow-sm transition-colors"
      style={{
        borderColor: status === "ok" ? "var(--aqua-border)" : sColor,
        opacity: estopActive ? 0.7 : 1,
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

      <div className="mt-2 flex items-baseline gap-1.5">
        {sensorError ? (
          <span className="text-display-large text-status-crit inline-flex items-center gap-2">
            <AlertOctagon className="h-7 w-7" aria-hidden /> ERRO
          </span>
        ) : (
          <>
            <span className="text-display-large text-aqua-text">{value.toFixed(decimals)}</span>
            {t.unit && <span className="text-sm text-aqua-text-muted">{t.unit}</span>}
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

      {paramKey === "cloro" && sensorError && (
        <p className="mt-2 rounded-md border border-status-crit/30 bg-status-crit/5 px-2.5 py-1.5 text-[11px] text-status-crit">
          Cloro 0,0 ppm por 3+ ciclos — provável falha do sensor, dosagem automática suspensa.
        </p>
      )}
    </article>
  );
}
