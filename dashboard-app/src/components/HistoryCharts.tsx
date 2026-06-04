import { useEffect, useState } from "react";
import { usePersistentState } from "@/hooks/usePersistentState";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ReferenceArea, AreaChart, Area, BarChart, Bar,
} from "recharts";
import { Download } from "lucide-react";
import { usePoolStore } from "@/store/poolStore";
import { THRESHOLDS, statusFor, statusLabel } from "@/lib/thresholds";
import type { SensorPoint } from "@/types/aquasense";

type Range = "24h" | "7d" | "30d";
type PanelKey = "temperaturas" | "quimicos" | "alcalinidade" | "bomba";
type SeriesKey = "temp_piscina" | "temp_coletor" | "ph" | "cloro" | "alcalinidade";

const PANELS_STORAGE_KEY = "graficos.painels";
const SERIES_STORAGE_KEY = "graficos.series";
const RANGE_STORAGE_KEY = "aquasense.charts.range";

const isRange = (v: unknown): v is Range => v === "24h" || v === "7d" || v === "30d";

const DEFAULT_PANELS: Record<PanelKey, boolean> = {
  temperaturas: true,
  quimicos: true,
  alcalinidade: true,
  bomba: true,
};

const DEFAULT_SERIES: Record<SeriesKey, boolean> = {
  temp_piscina: true,
  temp_coletor: true,
  ph: true,
  cloro: true,
  alcalinidade: true,
};

// Que séries pertencem a qual painel — usado para esconder chips do nível 2
// quando o painel correspondente está desligado no nível 1.
const SERIES_TO_PANEL: Record<SeriesKey, PanelKey> = {
  temp_piscina: "temperaturas",
  temp_coletor: "temperaturas",
  ph: "quimicos",
  cloro: "quimicos",
  alcalinidade: "alcalinidade",
};

function loadJSON<T extends Record<string, boolean>>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<T>;
    // merge — garante que novas chaves recebem default se o storage for antigo
    return { ...fallback, ...parsed };
  } catch {
    return fallback;
  }
}

function formatTick(t: number, range: Range): string {
  const d = new Date(t);
  if (range === "24h") return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function downloadCSV(filename: string, rows: Array<Record<string, string | number>>) {
  if (!rows.length) return;
  try {
    const headers = Object.keys(rows[0]);
    const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => r[h]).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error("[AquaSense] CSV export failed:", err);
  }
}

interface TooltipPayload {
  color: string;
  name: string;
  value: number;
}

interface TooltipBoxProps {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: number;
}

const TooltipBox = ({ active, payload, label }: TooltipBoxProps) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-aqua-border bg-aqua-surface/95 px-3 py-2 text-xs shadow-aqua backdrop-blur">
      <div className="mb-1 font-tabular text-aqua-text-muted">
        {new Date(label!).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
      </div>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-aqua-text-muted">{p.name}:</span>
          <span className="font-tabular text-aqua-text">{Number(p.value).toFixed(2)}</span>
        </div>
      ))}
    </div>
  );
};

export function HistoryCharts() {
  const history = usePoolStore((s) => s.history);
  const [range, setRange] = usePersistentState<Range>(RANGE_STORAGE_KEY, "24h", isRange);
  const [panels, setPanels] = useState<Record<PanelKey, boolean>>(() =>
    loadJSON(PANELS_STORAGE_KEY, DEFAULT_PANELS),
  );
  const [series, setSeries] = useState<Record<SeriesKey, boolean>>(() =>
    loadJSON(SERIES_STORAGE_KEY, DEFAULT_SERIES),
  );

  useEffect(() => {
    try {
      window.localStorage.setItem(PANELS_STORAGE_KEY, JSON.stringify(panels));
    } catch { /* ignore quota / private mode */ }
  }, [panels]);

  useEffect(() => {
    try {
      window.localStorage.setItem(SERIES_STORAGE_KEY, JSON.stringify(series));
    } catch { /* ignore */ }
  }, [series]);

  const togglePanel = (k: PanelKey) => setPanels((p) => ({ ...p, [k]: !p[k] }));
  const toggleSeries = (k: SeriesKey) => setSeries((s) => ({ ...s, [k]: !s[k] }));
  const showAllPanels = () => setPanels({ ...DEFAULT_PANELS });

  const allPanelsOff = !panels.temperaturas && !panels.quimicos && !panels.alcalinidade && !panels.bomba;

  // 24h = todos os pontos do history (5min × 288), 7d/30d = subsample
  let data: SensorPoint[] = history;
  if (range === "7d") data = history.filter((_, i) => i % 4 === 0); // ~72 pts mock
  if (range === "30d") data = history.filter((_, i) => i % 12 === 0);

  const tempT = THRESHOLDS.temp_piscina;
  const phT = THRESHOLDS.ph;
  const cloroT = THRESHOLDS.cloro;
  const alcalinidadeT = THRESHOLDS.alcalinidade;

  // Acionamentos por hora
  const pumpByHour = (() => {
    const buckets = new Map<string, number>();
    for (let i = 1; i < data.length; i++) {
      if (data[i].bomba_ligada) {
        const d = new Date(data[i].t);
        const k = d.toLocaleTimeString("pt-BR", { hour: "2-digit" });
        const dur = (data[i].t - data[i - 1].t) / 60000; // min
        buckets.set(k, (buckets.get(k) ?? 0) + dur);
      }
    }
    return Array.from(buckets.entries()).map(([hora, minutos]) => ({ hora, minutos: Math.round(minutos) }));
  })();

  const exportRows = data.map((d) => ({
    timestamp: new Date(d.t).toISOString(),
    ph: d.ph, cloro: d.cloro, alcalinidade: d.alcalinidade,
    temp_piscina_c: d.temp_piscina, temp_coletor_c: d.temp_coletor,
    bomba: d.bomba_ligada ? "ON" : "OFF",
  }));

  // Resumo textual (sr-only) — fallback acessível para o Recharts (SVG).
  const last = data[data.length - 1];
  const first = data[0];
  const rangeLabel = range === "24h" ? "24 horas" : range === "7d" ? "7 dias" : "30 dias";
  function summarize(key: "ph" | "cloro" | "alcalinidade" | "temp_piscina" | "temp_coletor") {
    if (!data.length) return null;
    const vals = data.map((d) => d[key] as number).filter((v) => Number.isFinite(v));
    if (!vals.length) return null;
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    const cur = last[key] as number;
    const t = THRESHOLDS[key];
    const status = statusFor(key, cur);
    return { min, max, avg, cur, t, status };
  }
  const pumpMinutes = pumpByHour.reduce((a, b) => a + b.minutos, 0);

  // Configuração dos chips do nível 2 — apenas séries cujo painel está visível.
  const SERIES_CONFIG: Array<{ key: SeriesKey; label: string; color: string }> = [
    { key: "temp_piscina", label: "Piscina", color: "var(--param-pool)" },
    { key: "temp_coletor", label: "Coletor solar", color: "var(--param-solar)" },
    { key: "ph", label: "pH", color: "var(--param-ph)" },
    { key: "cloro", label: "Cloro", color: "var(--param-orp)" },
    { key: "alcalinidade", label: "Alcalinidade", color: "var(--param-cond)" },
  ];
  const visibleSeriesChips = SERIES_CONFIG.filter((s) => panels[SERIES_TO_PANEL[s.key]]);

  const PANEL_CONFIG: Array<{ key: PanelKey; label: string }> = [
    { key: "temperaturas", label: "Temperaturas" },
    { key: "quimicos", label: "pH e Cloro" },
    { key: "alcalinidade", label: "Alcalinidade" },
    { key: "bomba", label: "Bomba" },
  ];

  return (
    <div className="space-y-5">
      {/* tabs + export */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          className="inline-flex rounded-xl border border-aqua-border bg-aqua-surface p-1"
          role="tablist"
          aria-label="Período do histórico"
        >
          {(["24h", "7d", "30d"] as Range[]).map((r) => (
            <button
              key={r}
              role="tab"
              aria-selected={range === r}
              aria-controls="aquasense-history-charts"
              onClick={() => setRange(r)}
              className={`rounded-lg px-3.5 py-1.5 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-aqua-accent ${
                range === r ? "bg-aqua-accent text-aqua-bg font-medium" : "text-aqua-text-muted hover:text-aqua-text"
              }`}
            >
              {r === "24h" ? "24 horas" : r === "7d" ? "7 dias" : "30 dias"}
            </button>
          ))}
        </div>
        <button
          onClick={() => downloadCSV(`aquasense_${range}_${Date.now()}.csv`, exportRows)}
          className="inline-flex items-center gap-2 rounded-lg border border-aqua-border bg-aqua-surface px-3.5 py-1.5 text-sm text-aqua-text-muted hover:text-aqua-text focus:outline-none focus-visible:ring-2 focus-visible:ring-aqua-accent"
          aria-label={`Exportar histórico de ${range === "24h" ? "24 horas" : range === "7d" ? "7 dias" : "30 dias"} em CSV`}
        >
          <Download className="h-4 w-4" aria-hidden="true" /> Exportar CSV
        </button>
      </div>

      {/* Nível 1 — Painéis (estrutura, cor neutra) */}
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Alternar painéis visíveis">
        <span className="text-xs text-aqua-text-muted">Painéis:</span>
        {PANEL_CONFIG.map(({ key, label }) => {
          const active = panels[key];
          return (
            <button
              key={key}
              onClick={() => togglePanel(key)}
              aria-pressed={active}
              aria-label={`${active ? "Ocultar" : "Mostrar"} painel ${label}`}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-aqua-accent ${
                active
                  ? "border-aqua-text/40 bg-aqua-text/10 text-aqua-text"
                  : "border-aqua-border bg-transparent text-aqua-text-muted hover:text-aqua-text"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Nível 2 — Séries (dados, cor da série). Só aparece se há ao menos 1 chip aplicável. */}
      {visibleSeriesChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Alternar séries dos gráficos">
          <span className="text-xs text-aqua-text-muted">Séries:</span>
          {visibleSeriesChips.map(({ key, label, color }) => {
            const active = series[key];
            return (
              <button
                key={key}
                onClick={() => toggleSeries(key)}
                aria-pressed={active}
                aria-label={`${active ? "Ocultar" : "Mostrar"} série ${label}`}
                className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-aqua-accent"
                style={{
                  borderColor: color,
                  color: active ? color : "var(--aqua-text-muted)",
                  backgroundColor: active ? `color-mix(in oklab, ${color} 14%, transparent)` : "transparent",
                  opacity: active ? 1 : 0.55,
                }}
              >
                <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                {label}
              </button>
            );
          })}
        </div>
      )}

      {allPanelsOff && (
        <div className="rounded-2xl border border-dashed border-aqua-border bg-aqua-surface/40 p-8 text-center">
          <p className="mb-3 text-sm text-aqua-text-muted">
            Selecione ao menos um painel para visualizar dados.
          </p>
          <button
            onClick={showAllPanels}
            className="inline-flex items-center gap-2 rounded-lg border border-aqua-border bg-aqua-surface px-3.5 py-1.5 text-sm text-aqua-text hover:bg-aqua-surface/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-aqua-accent"
          >
            Mostrar todos
          </button>
        </div>
      )}

      <div id="aquasense-history-charts" role="tabpanel" className="space-y-5">
      {panels.temperaturas && (
      <ChartCard
        title="Temperaturas"
        subtitle="Piscina · Coletor · Setpoint"
        ariaDescription={`Gráfico de linha das temperaturas da piscina e do coletor solar nas últimas ${rangeLabel}, com a faixa ideal destacada.`}
        fallback={
          <SummaryTable
            caption={`Resumo de temperaturas — ${rangeLabel}`}
            rows={[
              { key: "temp_piscina", label: "Piscina", summary: summarize("temp_piscina") },
              { key: "temp_coletor", label: "Coletor solar", summary: summarize("temp_coletor") },
            ]}
          />
        }
      >
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--aqua-border)" opacity={0.4} />
            <XAxis dataKey="t" tickFormatter={(t) => formatTick(t, range)} stroke="var(--aqua-text-muted)" fontSize={11} />
            <YAxis stroke="var(--aqua-text-muted)" fontSize={11} domain={[15, 75]} />
            <Tooltip content={<TooltipBox />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <ReferenceArea y1={tempT.idealMin} y2={tempT.idealMax} fill="var(--status-ok)" fillOpacity={0.08} />
            {series.temp_piscina && <Line type="monotone" dataKey="temp_piscina" name="Piscina" stroke="var(--param-pool)" strokeWidth={2.5} dot={false} isAnimationActive={false} />}
            {series.temp_coletor && <Line type="monotone" dataKey="temp_coletor" name="Coletor" stroke="var(--param-solar)" strokeWidth={2.5} dot={false} isAnimationActive={false} />}
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>
      )}

      {panels.quimicos && (
      <ChartCard
        title="Químicos da água"
        subtitle="pH e Cloro"
        ariaDescription="Gráfico de linha com pH (eixo esquerdo) e Cloro em ppm (eixo direito), faixa ideal destacada."
        fallback={
          <SummaryTable
            caption={`Resumo de pH e Cloro — ${rangeLabel}`}
            rows={[
              { key: "ph", label: "pH", summary: summarize("ph") },
              { key: "cloro", label: "Cloro", summary: summarize("cloro") },
            ]}
          />
        }
      >
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--aqua-border)" opacity={0.4} />
            <XAxis dataKey="t" tickFormatter={(t) => formatTick(t, range)} stroke="var(--aqua-text-muted)" fontSize={11} />
            <YAxis yAxisId="ph" domain={[6.8, 8]} stroke="var(--param-ph)" fontSize={11} />
            <YAxis yAxisId="cloro" orientation="right" domain={[0, 5]} stroke="var(--param-orp)" fontSize={11} />
            <Tooltip content={<TooltipBox />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <ReferenceArea yAxisId="ph" y1={phT.idealMin} y2={phT.idealMax} fill="var(--status-ok)" fillOpacity={0.08} />
            {series.ph && <Line yAxisId="ph" type="monotone" dataKey="ph" name="pH" stroke="var(--param-ph)" strokeWidth={2.5} dot={false} isAnimationActive={false} />}
            {series.cloro && <Line yAxisId="cloro" type="monotone" dataKey="cloro" name="Cloro (ppm)" stroke="var(--param-orp)" strokeWidth={2.5} dot={false} isAnimationActive={false} />}
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>
      )}

      {panels.alcalinidade && (
      <ChartCard
        title="Alcalinidade"
        subtitle="ppm"
        ariaDescription="Gráfico de área da alcalinidade da água em ppm."
        fallback={
          <SummaryTable
            caption={`Resumo de alcalinidade — ${rangeLabel}`}
            rows={[{ key: "alcalinidade", label: "Alcalinidade", summary: summarize("alcalinidade") }]}
          />
        }
      >
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="condFill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="var(--param-cond)" stopOpacity={0.5} />
                <stop offset="100%" stopColor="var(--param-cond)" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--aqua-border)" opacity={0.4} />
            <XAxis dataKey="t" tickFormatter={(t) => formatTick(t, range)} stroke="var(--aqua-text-muted)" fontSize={11} />
            <YAxis stroke="var(--aqua-text-muted)" fontSize={11} domain={[60, 140]} />
            <Tooltip content={<TooltipBox />} />
            <ReferenceArea y1={alcalinidadeT.idealMin} y2={alcalinidadeT.idealMax} fill="var(--status-ok)" fillOpacity={0.1} />
            {series.alcalinidade && <Area type="monotone" dataKey="alcalinidade" name="Alcalinidade" stroke="var(--param-cond)" fill="url(#condFill)" strokeWidth={2.5} isAnimationActive={false} />}
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>
      )}

      {panels.bomba && (
      <ChartCard
        title="Acionamentos da bomba"
        subtitle="Minutos ligada por hora"
        ariaDescription="Gráfico de barras com o total de minutos em que a bomba ficou ligada por hora."
        fallback={
          <div className="sr-only">
            <p>
              Período analisado: {rangeLabel}. Início: {first ? new Date(first.t).toLocaleString("pt-BR") : "—"}.
              Fim: {last ? new Date(last.t).toLocaleString("pt-BR") : "—"}. Total de minutos com bomba ligada: {pumpMinutes}.
            </p>
            {pumpByHour.length > 0 && (
              <table>
                <caption>Minutos da bomba ligada por hora</caption>
                <thead>
                  <tr><th scope="col">Hora</th><th scope="col">Minutos</th></tr>
                </thead>
                <tbody>
                  {pumpByHour.map((row) => (
                    <tr key={row.hora}><td>{row.hora}</td><td>{row.minutos}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        }
      >
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={pumpByHour} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--aqua-border)" opacity={0.4} />
            <XAxis dataKey="hora" stroke="var(--aqua-text-muted)" fontSize={11} />
            <YAxis stroke="var(--aqua-text-muted)" fontSize={11} />
            <Tooltip
              contentStyle={{ backgroundColor: "var(--aqua-surface)", border: "1px solid var(--aqua-border)", borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: "var(--aqua-text-muted)" }}
            />
            <Bar dataKey="minutos" fill="var(--aqua-primary)" radius={[6, 6, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
      )}
      </div>
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
  ariaDescription,
  fallback,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  ariaDescription?: string;
  fallback?: React.ReactNode;
}) {
  const headingId = `chart-${title.replace(/\s+/g, "-").toLowerCase()}`;
  const descId = `${headingId}-desc`;
  return (
    <section
      className="rounded-2xl border border-aqua-border bg-aqua-surface p-4 sm:p-5"
      aria-labelledby={headingId}
      aria-describedby={ariaDescription ? descId : undefined}
    >
      <div className="mb-3 flex items-baseline justify-between">
        <h3 id={headingId} className="text-sm font-semibold text-aqua-text">{title}</h3>
        <span className="text-xs text-aqua-text-muted">{subtitle}</span>
      </div>
      {ariaDescription && <p id={descId} className="sr-only">{ariaDescription}</p>}
      <div role="img" aria-label={ariaDescription ?? title}>
        {children}
      </div>
      {fallback && <div className="sr-only">{fallback}</div>}
    </section>
  );
}

type SummaryRow = {
  key: string;
  label: string;
  summary: {
    min: number;
    max: number;
    avg: number;
    cur: number;
    t: { unit: string; idealMin: number; idealMax: number };
    status: "ok" | "warn" | "crit";
  } | null;
};

function SummaryTable({ caption, rows }: { caption: string; rows: SummaryRow[] }) {
  const fmt = (n: number) => (Math.abs(n) >= 10 ? n.toFixed(1) : n.toFixed(2));
  return (
    <table>
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th scope="col">Série</th>
          <th scope="col">Atual</th>
          <th scope="col">Mín.</th>
          <th scope="col">Méd.</th>
          <th scope="col">Máx.</th>
          <th scope="col">Faixa ideal</th>
          <th scope="col">Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ key, label, summary }) => (
          <tr key={key}>
            <th scope="row">{label}</th>
            {summary ? (
              <>
                <td>{fmt(summary.cur)}{summary.t.unit}</td>
                <td>{fmt(summary.min)}{summary.t.unit}</td>
                <td>{fmt(summary.avg)}{summary.t.unit}</td>
                <td>{fmt(summary.max)}{summary.t.unit}</td>
                <td>{fmt(summary.t.idealMin)}–{fmt(summary.t.idealMax)}{summary.t.unit}</td>
                <td>{statusLabel(summary.status)}</td>
              </>
            ) : (
              <td colSpan={6}>Sem dados</td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
