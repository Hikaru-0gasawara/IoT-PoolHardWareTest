import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { AlertsPanel } from "@/components/AlertsPanel";
import { PageHeading } from "@/components/editorial/PageHeading";

export const Route = createFileRoute("/alertas")({
  head: () => ({
    meta: [
      { title: "Alertas — AquaSense IoT" },
      { name: "description", content: "Alertas e notificações de parâmetros fora da faixa ideal." },
      { property: "og:title", content: "Alertas — AquaSense IoT" },
      { property: "og:description", content: "Histórico e gestão de alertas da piscina." },
    ],
  }),
  component: AlertasPage,
});

function AlertasPage() {
  return (
    <AppShell>
      <div className="fade-up space-y-6">
        <PageHeading
          eyebrow="Monitor"
          title="Alertas"
          subtitle="Disparos automáticos quando algum parâmetro sai da faixa segura definida no firmware."
        />
        <AlertsPanel />
      </div>
    </AppShell>
  );
}
