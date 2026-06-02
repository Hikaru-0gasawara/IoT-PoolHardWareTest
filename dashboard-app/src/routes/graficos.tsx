import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { HistoryCharts } from "@/components/HistoryCharts";

export const Route = createFileRoute("/graficos")({
  head: () => ({
    meta: [
      { title: "Gráficos — AquaSense IoT" },
      { name: "description", content: "Histórico de 24h, 7d e 30d de pH, cloro, alcalinidade, temperaturas e acionamentos da bomba." },
      { property: "og:title", content: "Gráficos — AquaSense IoT" },
      { property: "og:description", content: "Análise histórica e exportação CSV dos sensores da piscina." },
    ],
  }),
  component: GraficosPage,
});

function GraficosPage() {
  return (
    <AppShell>
      <div className="fade-up">
        <header className="mb-4">
          <h1 className="text-xl font-semibold text-aqua-text">Histórico</h1>
          <p className="text-sm text-aqua-text-muted">Telemetria detalhada com exportação CSV.</p>
        </header>
        <HistoryCharts />
      </div>
    </AppShell>
  );
}
