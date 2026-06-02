import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { HeatingControl } from "@/components/HeatingControl";

export const Route = createFileRoute("/controle")({
  head: () => ({
    meta: [
      { title: "Aquecimento — AquaSense IoT" },
      { name: "description", content: "Estado do controle automático de aquecimento solar: histerese ΔT e log de acionamentos da bomba." },
      { property: "og:title", content: "Aquecimento — AquaSense IoT" },
      { property: "og:description", content: "Visualização da histerese ΔT e dos acionamentos da bomba reportados pelo ESP32." },
    ],
  }),
  component: ControlePage,
});

function ControlePage() {
  return (
    <AppShell>
      <div className="fade-up">
        <header className="mb-4">
          <h1 className="text-xl font-semibold text-aqua-text">Aquecimento solar</h1>
          <p className="text-sm text-aqua-text-muted">Estado do controle automático e histórico de acionamentos da bomba.</p>
        </header>
        <HeatingControl />
      </div>
    </AppShell>
  );
}
