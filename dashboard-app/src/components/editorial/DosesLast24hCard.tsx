import type { DoseEvent, DoseChemical } from "@/types/firmware";

// Card "Doses nas últimas 24h" — 3 barras horizontais (cloro / ácido / base).
// Conta apenas eventos `completed` no buffer (até 50 do MqttProvider). Se o
// firmware publicar system/health com doses_today, esse valor poderia
// substituir a contagem local (mais fiel) — fora do escopo desta rodada.

interface Props {
  events: DoseEvent[];
  dosingNow: DoseChemical | null;
  estopActive: boolean;
  loading: boolean;
}

const PRODUCTS: { key: DoseChemical; label: string; color: string }[] = [
  { key: "cloro", label: "Cloro", color: "var(--param-cloro)" },
  { key: "acido", label: "Ácido (pH−)", color: "var(--param-ph)" },
  { key: "base", label: "Base (pH+)", color: "var(--param-alc)" },
];

export function DosesLast24hCard({ events, dosingNow, estopActive, loading }: Props) {
  const since = Date.now() - 24 * 60 * 60 * 1000;
  const counts: Record<DoseChemical, number> = { cloro: 0, acido: 0, base: 0 };
  for (const ev of events) {
    if (ev.event === "completed" && ev.t >= since) counts[ev.parameter] += 1;
  }
  const max = Math.max(1, ...PRODUCTS.map((p) => counts[p.key]));

  return (
    <article className="rounded-2xl border border-aqua-border bg-aqua-surface p-5">
      <header className="flex items-baseline justify-between">
        <h3 className="font-display text-base font-semibold text-aqua-text">Doses nas últimas 24h</h3>
        {estopActive ? (
          <span className="text-[10px] uppercase tracking-widest text-status-crit">dosagem travada</span>
        ) : (
          <span className="text-label">FIFO 50</span>
        )}
      </header>

      <ul className="mt-4 space-y-3">
        {PRODUCTS.map((p) => {
          const n = counts[p.key];
          const w = (n / max) * 100;
          const active = dosingNow === p.key;
          return (
            <li key={p.key} className="space-y-1">
              <div className="flex items-baseline justify-between text-xs">
                <span className="flex items-center gap-2 text-aqua-text-muted">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} aria-hidden />
                  {p.label}
                  {active && <span className="text-[10px] font-medium text-aqua-accent">● dosando</span>}
                </span>
                <span className="font-tabular text-aqua-text">{loading ? "—" : n}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-aqua-surface-2">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${loading ? 0 : Math.max(n > 0 ? 6 : 0, w)}%`, backgroundColor: p.color, opacity: estopActive ? 0.35 : 0.85 }}
                />
              </div>
            </li>
          );
        })}
      </ul>

      {loading && (
        <p className="mt-3 text-xs text-aqua-text-muted">Aguardando primeiro ciclo do ESP32…</p>
      )}
    </article>
  );
}
