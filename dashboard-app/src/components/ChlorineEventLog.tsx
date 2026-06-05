import { ArrowDownRight, ArrowUpRight, CheckCircle2, AlertTriangle } from "lucide-react";
import { usePoolStore } from "@/store/poolStore";
import { statusColor } from "@/lib/thresholds";
import type { ChemEvent } from "@/types/aquasense";

// Log de eventos de cruzamento de faixa do Cloro (faixa ideal 1.0–3.0 ppm).
// Cada vez que a leitura entra ou sai da faixa, o poolStore registra um
// ChemEvent — aqui os exibimos com cor e ícone dinâmicos por severidade.

function relTime(t: number): string {
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return `há ${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `há ${m}min`;
  const h = Math.round(m / 60);
  return `há ${h}h`;
}

function describe(e: ChemEvent): string {
  if (e.tipo === "entrou_faixa") return "Cloro voltou à faixa ideal (1.0–3.0 ppm)";
  return e.direcao === "baixo"
    ? "Cloro caiu abaixo de 1.0 ppm — desinfecção insuficiente"
    : "Cloro subiu acima de 3.0 ppm — excesso de cloro";
}

export function ChlorineEventLog() {
  const events = usePoolStore((s) => s.cloroEvents);

  return (
    <section aria-labelledby="cloro-eventos-heading" className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2
          id="cloro-eventos-heading"
          className="font-display text-xl font-semibold tracking-tight text-aqua-text"
        >
          Eventos de Cloro
        </h2>
        <p className="text-xs text-aqua-text-muted">Cruzamentos da faixa 1.0–3.0 ppm</p>
      </div>

      <div className="rounded-2xl border border-aqua-border bg-aqua-surface p-4">
        {events.length === 0 ? (
          <p className="py-6 text-center text-sm text-aqua-text-muted">
            Nenhum evento registrado — o cloro permaneceu dentro da faixa.
          </p>
        ) : (
          <ul className="divide-y divide-aqua-border">
            {events.map((e) => {
              const color =
                e.tipo === "entrou_faixa" ? "var(--status-ok)" : statusColor(e.severity);
              const Icon =
                e.tipo === "entrou_faixa"
                  ? CheckCircle2
                  : e.direcao === "baixo"
                    ? ArrowDownRight
                    : e.direcao === "alto"
                      ? ArrowUpRight
                      : AlertTriangle;
              return (
                <li key={`${e.t}-${e.valor}`} className="flex items-center gap-3 py-2.5">
                  <span
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                    style={{
                      backgroundColor: `color-mix(in oklab, ${color} 15%, transparent)`,
                      color,
                    }}
                  >
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-aqua-text">{describe(e)}</p>
                    <p className="text-xs text-aqua-text-muted">
                      <span className="font-tabular" style={{ color }}>
                        {e.valor.toFixed(1)} ppm
                      </span>
                      {" · "}
                      {relTime(e.t)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
