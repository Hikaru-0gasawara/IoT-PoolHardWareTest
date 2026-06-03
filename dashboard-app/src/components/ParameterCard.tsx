import { memo, useMemo } from "react";
import { motion } from "framer-motion";
import { LineChart, Line, ResponsiveContainer, YAxis, Tooltip } from "recharts";
import { TrendingUp, TrendingDown, Minus, AlertOctagon, CheckCircle2, AlertTriangle, AlertCircle } from "lucide-react";
import type { ParameterKey } from "@/types/aquasense";
import { THRESHOLDS, statusFor, statusColor } from "@/lib/thresholds";
import { usePoolStore } from "@/store/poolStore";
import { usePoolData, useTemperatures, useConnection, useDoseInProgress } from "@/hooks/useAquaSense";
import { isSensorError } from "@/types/firmware";
import { formatTooltipContent, buildCardAriaLabel } from "@/lib/sparklineTooltip";
import { CalibrationField } from "@/components/CalibrationField";
import type { CalibrationParam } from "@/hooks/useCalibration";
import { cn } from "@/lib/utils";

// Mapeia chave interna do dashboard → chave do hook de calibração (inglês).
// Temperatura não calibra (não faz sentido via kit colorimétrico).
const CALIBRATION_MAP: Partial<Record<ParameterKey, { key: CalibrationParam; unit: string }>> = {
  ph: { key: "ph", unit: "" },
  cloro: { key: "chlorine", unit: "ppm" },
  alcalinidade: { key: "alkalinity", unit: "ppm" },
};

interface CardProps {
  paramKey: ParameterKey;
  icon: React.ReactNode;
}

export const ParameterCard = memo(function ParameterCard({ paramKey, icon }: CardProps) {
  const value = usePoolStore((s) => s[paramKey] as number);
  const history = usePoolStore((s) => s.history);
  const t = THRESHOLDS[paramKey];

  // Status do firmware tem prioridade sobre o cálculo local (quando MQTT real).
  const wq = usePoolData();
  const temps = useTemperatures();
  const conn = useConnection();
  // v4.0 — indicador sutil "dosando" no card relevante. Mapeamento:
  //   cloro → card de cloro
  //   acido (pH-) e base (pH+) → ambos visíveis no card de pH
  // Nada saturado: cinza pequeno, sem competir com a pílula de status.
  const dose = useDoseInProgress();
  const dosingThis =
    (paramKey === "cloro" && dose === "cloro") ||
    (paramKey === "ph" && (dose === "acido" || dose === "base"));
  const dosingLabel =
    dose === "acido" ? "ácido" : dose === "base" ? "base" : "cloro";
  const fwStatus =
    conn.source === "mqtt"
      ? paramKey === "ph" ? wq.ph_status
      : paramKey === "cloro" ? wq.cloro_status
      : paramKey === "alcalinidade" ? wq.alcalinidade_status
      : undefined
      : undefined;
  const status = fwStatus
    ? (fwStatus === "OK" ? "ok" : "crit")
    : statusFor(paramKey, value);
  const sColor = statusColor(status);

  // -99.0 do firmware = sensor com erro (vale para temperaturas principalmente).
  // FORK PT (Adição 1) — cloro=0.0 por 3+ ciclos consecutivos é tratado como
  // erro de sensor (provavelmente leitura morta), não como "preciso dosar".
  const cloroEmErro = usePoolStore((s) => s.cloroEmErro);
  const sensorError =
    (paramKey === "temp_piscina" && conn.source === "mqtt" && isSensorError(temps.piscina_C)) ||
    (paramKey === "temp_coletor" && conn.source === "mqtt" && isSensorError(temps.coletor_solar_C)) ||
    (paramKey === "cloro" && cloroEmErro) ||
    isSensorError(value);

  // Ícone de status — complementa a cor da borda (acessibilidade daltônica).
  // Mantém AlertOctagon dedicado a sensorError, que é uma falha distinta de
  // "fora da faixa": o sensor não está medindo nada.
  const StatusIcon = sensorError
    ? AlertOctagon
    : status === "ok" ? CheckCircle2
    : status === "warn" ? AlertTriangle
    : AlertCircle;
  const statusIconColor = sensorError ? "var(--status-crit)" : sColor;
  const statusIconLabel = sensorError
    ? "erro de sensor"
    : status === "ok" ? "dentro da faixa ideal"
    : status === "warn" ? "atenção"
    : "crítico";

  // sparkline — últimos 24 pontos (~2h) — recalcula só quando history muda (5min)
  const spark = useMemo(
    () => history.slice(-24).map((p) => ({ v: p[paramKey] as number, t: p.t })),
    [history, paramKey],
  );

  // Domínio mínimo do sparkline — quando a amplitude real é muito pequena
  // (ex: coletor estável por 2h), Recharts auto-ajusta o eixo Y para a
  // diferença mínima e o gráfico vira uma reta visualmente "morta". Forçamos
  // uma amplitude mínima por parâmetro para preservar legibilidade.
  const sparkDomain = useMemo<[number, number] | undefined>(() => {
    if (spark.length === 0) return undefined;
    const values = spark.map((p) => p.v).filter((v) => Number.isFinite(v) && v > -50);
    if (values.length === 0) return undefined;
    const min = Math.min(...values);
    const max = Math.max(...values);
    // Amplitude mínima visual por parâmetro — calibrada para mostrar oscilação
    // sem amplificar ruído insignificante.
    const minAmplitude =
      paramKey === "ph" ? 0.1
      : paramKey === "cloro" ? 0.3
      : paramKey === "alcalinidade" ? 5
      : 1.5; // temperaturas
    const amplitude = Math.max(max - min, minAmplitude);
    const center = (max + min) / 2;
    const pad = amplitude * 0.15;
    return [center - amplitude / 2 - pad, center + amplitude / 2 + pad];
  }, [spark, paramKey]);

  // tendência: comparar com ~1h atrás (12 pontos × 5min)
  const { diff, trendIcon } = useMemo(() => {
    const past = history[Math.max(0, history.length - 12)]?.[paramKey] as number | undefined;
    const d = past !== undefined ? value - past : 0;
    const icon = Math.abs(d) < (t.idealMax - t.idealMin) * 0.02
      ? <Minus className="h-3 w-3" />
      : d > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />;
    return { diff: d, trendIcon: icon };
  }, [history, paramKey, value, t]);

  const decimals = paramKey === "alcalinidade" ? 0 : paramKey === "ph" ? 2 : 1;

  // posição na barra de range
  const pos = ((value - t.rangeMin) / (t.rangeMax - t.rangeMin)) * 100;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "group relative overflow-hidden rounded-2xl border bg-aqua-surface p-4 shadow-sm transition-all hover:shadow-aqua",
        "focus-within:ring-2 focus-within:ring-aqua-accent focus-within:ring-offset-2 focus-within:ring-offset-aqua-bg",
      )}
      style={{ borderColor: status === "ok" ? "var(--aqua-border)" : sColor }}
      role="group"
      tabIndex={0}
      aria-label={buildCardAriaLabel(paramKey, value, spark.map((p) => p.v))}
    >
      {/* status accent stripe */}
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-0.5" style={{ backgroundColor: sensorError ? "var(--status-crit)" : sColor }} />

      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2.5">
          <div
            aria-hidden="true"
            className="flex h-9 w-9 items-center justify-center rounded-xl"
            style={{ backgroundColor: `color-mix(in oklab, ${t.color} 18%, transparent)`, color: t.color }}
          >
            {icon}
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-xs font-medium text-aqua-text-muted">
              <StatusIcon
                className="h-3.5 w-3.5 shrink-0"
                style={{ color: statusIconColor }}
                aria-label={`Status: ${statusIconLabel}`}
                role="img"
              />
              <span>{t.label}</span>
            </div>
            {sensorError ? (
              <div className="flex items-center gap-1 text-[10px] font-semibold text-status-crit">
                <AlertOctagon className="h-3 w-3" />
                {paramKey === "cloro" && cloroEmErro && !isSensorError(value)
                  ? "SENSOR PROVÁVEL FALHA"
                  : "SENSOR -99.0"}
              </div>
            ) : (
              <div className="flex items-center gap-1 text-[10px]" style={{ color: sColor }}>
                {trendIcon}
                <span className="font-tabular">{diff >= 0 ? "+" : ""}{diff.toFixed(decimals)}</span>
                <span className="text-aqua-text-muted">vs 1h</span>
                {fwStatus && (
                  <span className="ml-1 rounded-full border px-1.5 py-px text-[9px] font-medium" style={{ borderColor: sColor, color: sColor }}>
                    {fwStatus}
                  </span>
                )}
                {dosingThis && (
                  <span className="ml-1 text-[9px] italic text-aqua-text-muted/80">
                    · dosando {dosingLabel}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-baseline gap-1.5">
        {sensorError ? (
          <span className="font-tabular text-4xl font-bold text-status-crit">ERRO</span>
        ) : (
          <>
            <motion.span
              key={Math.round(value * 100)}
              initial={{ opacity: 0.7 }}
              animate={{ opacity: 1 }}
              className="font-tabular text-4xl font-bold text-aqua-text"
            >
              {value.toFixed(decimals)}
            </motion.span>
            {t.unit && <span className="text-sm text-aqua-text-muted">{t.unit}</span>}
          </>
        )}
      </div>

      {/* range bar */}
      {paramKey !== "temp_coletor" && (
        <div
          className="mt-3 space-y-1"
          role="meter"
          aria-label={`${t.label} dentro da faixa ${t.rangeMin} a ${t.rangeMax}${t.unit ?? ""}`}
          aria-valuenow={Number.isFinite(value) ? Number(value.toFixed(decimals)) : undefined}
          aria-valuemin={t.rangeMin}
          aria-valuemax={t.rangeMax}
          aria-valuetext={`${value.toFixed(decimals)}${t.unit ?? ""}, ideal entre ${t.idealMin} e ${t.idealMax}`}
        >
          <div className="relative h-2 overflow-hidden rounded-full bg-aqua-surface-2">
            <div
              aria-hidden="true"
              className="absolute inset-y-0 rounded-full"
              style={{
                left: `${((t.warnMin - t.rangeMin) / (t.rangeMax - t.rangeMin)) * 100}%`,
                width: `${((t.warnMax - t.warnMin) / (t.rangeMax - t.rangeMin)) * 100}%`,
                background: `linear-gradient(to right, var(--status-warn), var(--status-ok), var(--status-ok), var(--status-warn))`,
                opacity: 0.55,
              }}
            />
            <div
              aria-hidden="true"
              className="absolute inset-y-0 rounded-full"
              style={{
                left: `${((t.idealMin - t.rangeMin) / (t.rangeMax - t.rangeMin)) * 100}%`,
                width: `${((t.idealMax - t.idealMin) / (t.rangeMax - t.rangeMin)) * 100}%`,
                backgroundColor: "var(--status-ok)",
                opacity: 0.5,
              }}
            />
            <motion.div
              aria-hidden="true"
              className="absolute top-1/2 h-3.5 w-1 -translate-y-1/2 rounded-full shadow"
              style={{ backgroundColor: t.color }}
              animate={{ left: `calc(${pos}% - 2px)` }}
              transition={{ type: "spring", stiffness: 120, damping: 18 }}
            />
          </div>
          <div className="flex justify-between text-[9px] text-aqua-text-muted/70">
            <span>{t.rangeMin}</span>
            <span className="font-tabular">{t.idealMin}–{t.idealMax} ideal</span>
            <span>{t.rangeMax}</span>
          </div>
        </div>
      )}

      {/* sparkline */}
      <div className="mt-2 h-10 -mx-1" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={spark} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <YAxis hide domain={sparkDomain ?? ["auto", "auto"]} />
            <Tooltip
              cursor={{ stroke: t.color, strokeWidth: 1, strokeOpacity: 0.4 }}
              isAnimationActive={false}
              wrapperStyle={{ outline: "none", zIndex: 30 }}
              content={({ active, payload }) => {
                if (!active || !payload || payload.length === 0) return null;
                const p = payload[0]?.payload as { v: number; t: number } | undefined;
                if (!p) return null;
                const lines = formatTooltipContent(p, paramKey, Date.now());
                return (
                  <div
                    style={{
                      background: "color-mix(in oklab, var(--aqua-surface) 95%, transparent)",
                      border: "1px solid var(--aqua-border)",
                      borderRadius: 6,
                      padding: "6px 10px",
                      fontSize: 12,
                      lineHeight: 1.25,
                      pointerEvents: "none",
                    }}
                  >
                    <div
                      className="font-tabular"
                      style={{ fontWeight: 600, color: "var(--aqua-text)" }}
                    >
                      {lines.valueLine}
                    </div>
                    <div style={{ fontWeight: 400, fontSize: 11, color: "var(--aqua-text-muted)" }}>
                      {lines.timeLine}
                    </div>
                  </div>
                );
              }}
            />
            <Line type="monotone" dataKey="v" stroke={t.color} strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Calibração manual — só pH/Cloro/Alcalinidade. Esconde se sensor em
          erro (sem leitura útil para comparar com referência). */}
      {!sensorError && CALIBRATION_MAP[paramKey] && (
        <CalibrationField
          param={CALIBRATION_MAP[paramKey]!.key}
          unit={CALIBRATION_MAP[paramKey]!.unit}
          current={value}
        />
      )}
    </motion.div>
  );
});
