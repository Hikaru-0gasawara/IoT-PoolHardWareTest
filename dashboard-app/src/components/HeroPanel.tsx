import { motion } from "framer-motion";
import { usePoolStore } from "@/store/poolStore";
import { useNow } from "@/hooks/useNow";
import { Activity, Sun } from "lucide-react";

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}min`;
}

function deltaColor(dt: number): string {
  if (dt >= 5) return "var(--aqua-accent)";
  if (dt >= 1) return "var(--status-warn)";
  return "var(--status-ok)";
}

export function HeroPanel() {
  const pool = usePoolStore((s) => s.temp_piscina);
  const solar = usePoolStore((s) => s.temp_coletor);
  const dt = usePoolStore((s) => s.delta_t);
  const bombaOn = usePoolStore((s) => s.bomba_ligada);
  const since = usePoolStore((s) => s.bomba_estado_desde_t);
  const now = useNow(1000);
  const elapsed = formatDuration(now - since);

  return (
    <section
      className="rounded-3xl border border-aqua-border bg-gradient-to-br from-aqua-surface to-aqua-surface-2 p-5 shadow-aqua sm:p-7"
      aria-labelledby="hero-heading"
    >
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 id="hero-heading" className="text-lg font-semibold tracking-tight text-aqua-text sm:text-xl">Sistema de aquecimento solar</h2>
          <p className="text-sm text-aqua-text-muted">Piscina · Bomba · Coletor solar</p>
        </div>
        <div
          role="status"
          aria-live="polite"
          aria-label={bombaOn ? `Bomba circulando há ${elapsed}` : `Bomba parada há ${elapsed}`}
          className="hidden items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium md:flex"
          style={{
            borderColor: bombaOn ? "var(--flow)" : "var(--aqua-border)",
            color: bombaOn ? "var(--flow)" : "var(--aqua-text-muted)",
            backgroundColor: bombaOn ? "color-mix(in oklab, var(--flow) 12%, transparent)" : "transparent",
          }}
        >
          <Activity className="h-3.5 w-3.5" aria-hidden="true" />
          <span>
            {bombaOn ? "Circulando há " : "Parada há "}
            <span className="tnum">{elapsed}</span>
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 items-center gap-4 lg:grid-cols-[1fr_1.3fr_1fr]">
        {/* Pool */}
        <PoolGraphic temperature={pool} />
        {/* Pump + flow */}
        <PumpFlow on={bombaOn} />
        {/* Solar */}
        <SolarGraphic temperature={solar} />
      </div>

      {/* Delta T panel */}
      <div className="mt-6 rounded-2xl border border-aqua-border bg-aqua-bg/50 p-5">
        <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-between">
          <div className="text-center sm:text-left">
            <div className="text-xs uppercase tracking-widest text-aqua-text-muted">Diferencial térmico</div>
            <div className="font-tabular text-5xl font-bold sm:text-6xl" style={{ color: deltaColor(dt) }}>
              {dt >= 0 ? "+" : ""}{dt.toFixed(1)}<span className="text-3xl text-aqua-text-muted">°C</span>
            </div>
          </div>
          <div className="flex flex-col items-center gap-2 sm:items-end">
            <div className="flex items-center gap-3 text-xs text-aqua-text-muted">
              <span>🔥 Liga ΔT ≥ 5°C</span>
              <span className="opacity-30">|</span>
              <span>❄️ Desliga ΔT ≤ 1°C</span>
            </div>
            <p className="max-w-xs text-center text-xs text-aqua-text-muted/80 sm:text-right">
              A bomba circula a água da piscina pelo coletor solar quando há ganho térmico significativo.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function PoolGraphic({ temperature }: { temperature: number }) {
  return (
    <div className="flex flex-col items-center">
      <div className="relative h-44 w-full max-w-[280px]">
        <svg viewBox="0 0 280 180" className="h-full w-full" role="img" aria-label={`Piscina a ${temperature.toFixed(1)} graus Celsius`}>
          <title>{`Piscina: ${temperature.toFixed(1)}°C`}</title>
          <defs>
            <linearGradient id="water" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="oklch(0.68 0.14 240 / 0.9)" />
              <stop offset="100%" stopColor="oklch(0.46 0.10 235 / 0.95)" />
            </linearGradient>
          </defs>
          {/* pool border */}
          <rect x="20" y="50" width="240" height="110" rx="14" fill="oklch(0.30 0.05 240)" stroke="var(--aqua-border)" strokeWidth="2" />
          {/* water */}
          <rect x="28" y="62" width="224" height="92" rx="8" fill="url(#water)" />
          {/* surface ripple */}
          <g className="ripple-anim">
            <path d="M 8 70 Q 24 64 40 70 T 72 70 T 104 70 T 136 70 T 168 70 T 200 70 T 232 70 T 264 70 T 296 70 T 328 70" fill="none" stroke="oklch(1 0 0 / 0.25)" strokeWidth="1.5" />
            <path d="M 8 78 Q 24 82 40 78 T 72 78 T 104 78 T 136 78 T 168 78 T 200 78 T 232 78 T 264 78 T 296 78 T 328 78" fill="none" stroke="oklch(1 0 0 / 0.18)" strokeWidth="1" />
          </g>
          {/* swimmer */}
          <g transform="translate(40 38)" opacity="0.85">
            <circle cx="0" cy="0" r="4" fill="oklch(0.96 0.015 220)" />
            <path d="M -3 4 Q 0 10 3 4" stroke="oklch(0.96 0.015 220)" strokeWidth="1.5" fill="none" />
          </g>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pt-4">
          <motion.div
            key={Math.round(temperature * 10)}
            initial={{ opacity: 0.7 }}
            animate={{ opacity: 1 }}
            className="font-tabular text-4xl font-bold text-white drop-shadow-lg sm:text-5xl"
          >
            {temperature.toFixed(1)}°
          </motion.div>
        </div>
      </div>
      <div className="mt-2 text-sm font-medium uppercase tracking-widest text-aqua-text-muted">Piscina</div>
    </div>
  );
}

function SolarGraphic({ temperature }: { temperature: number }) {
  const hot = temperature > 40;
  return (
    <div className="flex flex-col items-center">
      <div className="relative h-44 w-full max-w-[260px]">
        <svg viewBox="0 0 260 180" className={"h-full w-full " + (hot ? "solar-glow" : "")} role="img" aria-label={`Coletor solar a ${temperature.toFixed(1)} graus Celsius${hot ? ", aquecido" : ""}`}>
          <title>{`Coletor solar: ${temperature.toFixed(1)}°C`}</title>
          <defs>
            <linearGradient id="solarPanel" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0%" stopColor={hot ? "oklch(0.78 0.16 75)" : "oklch(0.55 0.09 220)"} />
              <stop offset="100%" stopColor={hot ? "oklch(0.66 0.18 40)" : "oklch(0.46 0.10 235)"} />
            </linearGradient>
          </defs>
          {/* sun rays when hot */}
          {hot && (
            <g stroke="oklch(0.78 0.16 75)" strokeWidth="2" opacity="0.6">
              <line x1="130" y1="10" x2="130" y2="22" />
              <line x1="80" y1="20" x2="86" y2="32" />
              <line x1="180" y1="20" x2="174" y2="32" />
              <line x1="40" y1="50" x2="56" y2="56" />
              <line x1="220" y1="50" x2="204" y2="56" />
            </g>
          )}
          {/* collector body */}
          <rect x="40" y="50" width="180" height="110" rx="10" fill="url(#solarPanel)" stroke="var(--aqua-border)" strokeWidth="2" />
          {/* grid lines */}
          <g stroke="oklch(1 0 0 / 0.2)" strokeWidth="1">
            <line x1="40" y1="86" x2="220" y2="86" />
            <line x1="40" y1="122" x2="220" y2="122" />
            <line x1="100" y1="50" x2="100" y2="160" />
            <line x1="160" y1="50" x2="160" y2="160" />
          </g>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pt-4">
          <motion.div
            key={Math.round(temperature * 10)}
            initial={{ opacity: 0.7 }}
            animate={{ opacity: 1 }}
            className="font-tabular text-4xl font-bold text-white drop-shadow-lg sm:text-5xl"
          >
            {temperature.toFixed(1)}°
          </motion.div>
          {hot && <Sun className="mt-1 h-4 w-4 text-param-solar" aria-hidden="true" />}
        </div>
      </div>
      <div className="mt-2 text-sm font-medium uppercase tracking-widest text-aqua-text-muted">Coletor solar</div>
    </div>
  );
}

function PumpFlow({ on }: { on: boolean }) {
  const flowColor = on ? "var(--flow)" : "var(--aqua-border)";
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 320 200" className="h-44 w-full max-w-[340px]" role="img" aria-label={on ? "Bomba ativa, água circulando entre piscina e coletor solar" : "Bomba desligada, sem circulação"}>
        <title>{on ? "Bomba ativa" : "Bomba desligada"}</title>
        {/* top pipe (pool -> collector) */}
        <path d="M 10 60 H 310" stroke={flowColor} strokeWidth="4" fill="none" strokeLinecap="round" className={on ? "flow-anim" : ""} opacity={on ? 1 : 0.4} />
        {/* bottom pipe (collector -> pool) */}
        <path d="M 10 140 H 310" stroke={flowColor} strokeWidth="4" fill="none" strokeLinecap="round" className={on ? "flow-anim" : ""} opacity={on ? 0.85 : 0.4} style={{ animationDirection: "reverse" } as React.CSSProperties} />
        {/* arrows */}
        <polygon points="305,55 315,60 305,65" fill={flowColor} opacity={on ? 1 : 0.4} />
        <polygon points="15,135 5,140 15,145" fill={flowColor} opacity={on ? 1 : 0.4} />
        {/* pump body */}
        <g transform="translate(160 100)">
          <circle r="34" fill="var(--aqua-surface-2)" stroke={on ? "var(--flow)" : "var(--aqua-border)"} strokeWidth="2.5" className={on ? "aqua-pulse" : ""} />
          <circle r="22" fill="var(--aqua-bg)" />
          {/* impeller */}
          <g stroke={on ? "var(--flow)" : "var(--aqua-text-muted)"} strokeWidth="2.5" strokeLinecap="round">
            <line x1="-12" y1="0" x2="12" y2="0" />
            <line x1="0" y1="-12" x2="0" y2="12" />
            <line x1="-9" y1="-9" x2="9" y2="9" />
          </g>
        </g>
      </svg>
      <div className="mt-2 flex items-center gap-2 text-sm font-medium uppercase tracking-widest">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: on ? "var(--flow)" : "var(--aqua-text-muted)" }} />
        <span style={{ color: on ? "var(--flow)" : "var(--aqua-text-muted)" }}>
          Bomba {on ? "ATIVA" : "DESLIGADA"}
        </span>
      </div>
    </div>
  );
}
