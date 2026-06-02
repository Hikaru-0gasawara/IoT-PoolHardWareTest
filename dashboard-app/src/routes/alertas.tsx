import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { AlertsPanel } from "@/components/AlertsPanel";

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
      <div className="fade-up">
        <header className="mb-4">
          <h1 className="text-xl font-semibold text-aqua-text">Alertas</h1>
          <p className="text-sm text-aqua-text-muted">Disparos automáticos quando parâmetros saem da faixa segura.</p>
        </header>
        <AlertsPanel />
      </div>
    </AppShell>
  );
}
