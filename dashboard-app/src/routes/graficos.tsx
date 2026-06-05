import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { HistoryCharts } from "@/components/HistoryCharts";
import { PageHeading } from "@/components/editorial/PageHeading";

export const Route = createFileRoute("/graficos")({
  head: () => ({
    meta: [
      { title: "Gráficos — AquaSense IoT" },
      {
        name: "description",
        content:
          "Histórico de 24h, 7d e 30d de pH, cloro, alcalinidade, temperaturas e acionamentos da bomba.",
      },
      { property: "og:title", content: "Gráficos — AquaSense IoT" },
      {
        property: "og:description",
        content: "Análise histórica e exportação CSV dos sensores da piscina.",
      },
    ],
  }),
  component: GraficosPage,
});

function GraficosPage() {
  return (
    <AppShell>
      <div className="fade-up space-y-6">
        <PageHeading
          eyebrow="Telemetria"
          title="Histórico"
          subtitle="Janelas de 24h, 7 e 30 dias com exportação CSV — pH, cloro, alcalinidade, temperaturas e acionamentos da bomba."
        />
        <HistoryCharts />
      </div>
    </AppShell>
  );
}
