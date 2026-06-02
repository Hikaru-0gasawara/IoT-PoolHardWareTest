// Hero do sistema solar — SVG inline estático (Tarefa 3 anima depois).
// Mostra piscina, bomba e coletor com tubulações. O estado da bomba e o ΔT
// chegam por props para o componente ficar puro (sem store). Banner de
// histerese resume a regra "liga ≥5°C, desliga ≤1°C" para o operador casual.

interface Props {
  tempPiscina: number;
  tempColetor: number;
  deltaT: number;
  bombaOn: boolean;
  estado: "circulando" | "parada" | "emergencia";
}

function fmtTemp(v: number): string {
  if (!Number.isFinite(v) || v < -50) return "—";
  return `${v.toFixed(1)}°`;
}

export function SolarSystemHero({ tempPiscina, tempColetor, deltaT, bombaOn, estado }: Props) {
  const flow = estado === "emergencia" ? "var(--status-crit)" : bombaOn ? "var(--flow)" : "var(--aqua-border)";
  const flowOpacity = bombaOn && estado !== "emergencia" ? 1 : 0.4;
  const badgeLabel = estado === "emergencia" ? "● parada de emergência"
    : estado === "circulando" ? "● circulando"
    : "○ aguardando ΔT";
  const badgeStyle = estado === "emergencia"
    ? { borderColor: "var(--status-crit)", color: "var(--status-crit)", background: "color-mix(in oklab, var(--status-crit) 12%, transparent)" }
    : estado === "circulando"
    ? { borderColor: "var(--flow)", color: "var(--flow)", background: "color-mix(in oklab, var(--flow) 12%, transparent)" }
    : { borderColor: "var(--aqua-border)", color: "var(--aqua-text-muted)", background: "transparent" };

  return (
    <section
      aria-labelledby="hero-heading"
      className="rounded-3xl border border-aqua-border bg-gradient-to-br from-aqua-surface to-aqua-surface-2 p-6 shadow-aqua sm:p-8"
    >
      <header className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 id="hero-heading" className="font-display text-2xl font-semibold tracking-tight text-aqua-text sm:text-3xl">
            Aquecimento solar
          </h2>
          <p className="mt-1 text-sm text-aqua-text-muted">Piscina · Bomba · Coletor — visão integrada do circuito.</p>
        </div>
        <span
          role="status"
          aria-live="polite"
          className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium"
          style={badgeStyle}
        >
          {badgeLabel}
        </span>
      </header>

      <div className="grid grid-cols-1 items-center gap-4 lg:grid-cols-[1fr_1.4fr_1fr]">
        {/* Piscina */}
        <figure className="flex flex-col items-center">
          <svg viewBox="0 0 240 160" className="h-40 w-full max-w-[280px]" role="img" aria-label={`Piscina a ${fmtTemp(tempPiscina)}`}>
            <defs>
              <linearGradient id="ed-water" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="oklch(0.68 0.14 240 / 0.85)" />
                <stop offset="100%" stopColor="oklch(0.46 0.10 235 / 0.95)" />
              </linearGradient>
            </defs>
            <rect x="14" y="42" width="212" height="100" rx="12" fill="oklch(0.30 0.05 240)" stroke="var(--aqua-border)" strokeWidth="2" />
            <rect x="22" y="54" width="196" height="82" rx="6" fill="url(#ed-water)" />
            <path d="M 14 60 Q 30 54 46 60 T 78 60 T 110 60 T 142 60 T 174 60 T 206 60 T 238 60" fill="none" stroke="oklch(1 0 0 / 0.25)" strokeWidth="1.5" />
          </svg>
          <figcaption className="mt-2 text-center">
            <div className="text-display-medium text-aqua-text">{fmtTemp(tempPiscina)}</div>
            <div className="text-label mt-1">Piscina</div>
          </figcaption>
        </figure>

        {/* Bomba + tubulação */}
        <div className="flex flex-col items-center">
          <svg viewBox="0 0 320 180" className="h-40 w-full max-w-[360px]" role="img" aria-label={bombaOn ? "Bomba ativa, água circulando" : "Bomba parada"}>
            <path d="M 8 56 H 312" stroke={flow} strokeWidth="3.5" fill="none" strokeLinecap="round" opacity={flowOpacity} />
            <path d="M 8 128 H 312" stroke={flow} strokeWidth="3.5" fill="none" strokeLinecap="round" opacity={flowOpacity * 0.9} />
            <polygon points="306,52 316,56 306,60" fill={flow} opacity={flowOpacity} />
            <polygon points="14,124 4,128 14,132" fill={flow} opacity={flowOpacity} />
            <g transform="translate(160 92)">
              <circle r="32" fill="var(--aqua-surface-2)" stroke={flow} strokeWidth="2" opacity={estado === "emergencia" ? 0.5 : 1} />
              <circle r="20" fill="var(--aqua-bg)" />
              <g stroke={bombaOn ? "var(--flow)" : "var(--aqua-text-muted)"} strokeWidth="2.2" strokeLinecap="round">
                <line x1="-11" y1="0" x2="11" y2="0" />
                <line x1="0" y1="-11" x2="0" y2="11" />
                <line x1="-8" y1="-8" x2="8" y2="8" />
              </g>
            </g>
          </svg>
          <div className="mt-2 text-center">
            <div className="text-display-medium" style={{ color: deltaT >= 5 ? "var(--status-warn)" : deltaT >= 1 ? "var(--aqua-accent)" : "var(--aqua-text-muted)" }}>
              ΔT {deltaT >= 0 ? "+" : ""}{Number.isFinite(deltaT) ? deltaT.toFixed(1) : "—"}°
            </div>
            <div className="text-label mt-1">Liga ≥ 5°C · Desliga ≤ 1°C</div>
          </div>
        </div>

        {/* Coletor */}
        <figure className="flex flex-col items-center">
          <svg viewBox="0 0 240 160" className="h-40 w-full max-w-[280px]" role="img" aria-label={`Coletor a ${fmtTemp(tempColetor)}`}>
            <defs>
              <linearGradient id="ed-panel" x1="0" x2="1" y1="0" y2="1">
                <stop offset="0%" stopColor="oklch(0.78 0.16 75)" />
                <stop offset="100%" stopColor="oklch(0.66 0.18 40)" />
              </linearGradient>
            </defs>
            <rect x="32" y="42" width="176" height="100" rx="10" fill="url(#ed-panel)" stroke="var(--aqua-border)" strokeWidth="2" />
            <g stroke="oklch(1 0 0 / 0.22)" strokeWidth="1">
              <line x1="32" y1="76" x2="208" y2="76" />
              <line x1="32" y1="110" x2="208" y2="110" />
              <line x1="90" y1="42" x2="90" y2="142" />
              <line x1="150" y1="42" x2="150" y2="142" />
            </g>
          </svg>
          <figcaption className="mt-2 text-center">
            <div className="text-display-medium text-aqua-text">{fmtTemp(tempColetor)}</div>
            <div className="text-label mt-1">Coletor solar</div>
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
