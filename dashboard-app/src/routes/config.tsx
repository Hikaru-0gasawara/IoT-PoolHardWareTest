import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { AppShell } from "@/components/AppShell";
import { SettingsPanel } from "@/components/SettingsPanel";
import { DiagnosticPanel } from "@/components/DiagnosticPanel";
import { AdvancedControlPanel } from "@/components/AdvancedControlPanel";
import { ConfigTabsView } from "@/components/ConfigTabsView";
import { usePersistentState } from "@/hooks/usePersistentState";
import {
  parseTabParam,
  resolveInitialTab,
  TAB_SEARCH_KEY,
  DEFAULT_CONFIG_TAB,
  isConfigTab,
  type ConfigTab,
} from "@/routes/config.tabs";

export const Route = createFileRoute("/config")({
  // Deep link: /config?tab=sobre|controle-avancado|diagnostico
  validateSearch: (search: Record<string, unknown>): { tab?: ConfigTab } => {
    const tab = parseTabParam(search[TAB_SEARCH_KEY]);
    return tab ? { tab } : {};
  },
  head: () => ({
    meta: [
      { title: "Configurações — AquaSense IoT" },
      { name: "description", content: "Hardware, conexão MQTT, calibração, equipe e informações do sistema." },
      { property: "og:title", content: "Configurações — AquaSense IoT" },
      { property: "og:description", content: "Detalhes técnicos do sistema embarcado." },
    ],
  }),
  component: ConfigPage,
});

const TAB_CONTENT: Record<ConfigTab, React.ReactNode> = {
  "controle-avancado": <AdvancedControlPanel />,
  diagnostico: <DiagnosticPanel />,
  sobre: <SettingsPanel />,
};

function ConfigPage() {
  const navigate = useNavigate({ from: Route.fullPath });
  const search = Route.useSearch();
  const [stored, setStored] = usePersistentState<ConfigTab>(
    "aquasense.config.activeTab",
    DEFAULT_CONFIG_TAB,
    isConfigTab,
  );

  // Deep link vence a preferência persistida (refresh/compartilhar com ?tab=).
  const tab = resolveInitialTab(search.tab, stored);

  // Mantém o localStorage alinhado com o que está sendo exibido (inclui o caso
  // de chegar via deep link), para que a próxima visita sem link reabra a mesma aba.
  useEffect(() => {
    if (stored !== tab) setStored(tab);
  }, [tab, stored, setStored]);

  const handleChange = (next: ConfigTab) => {
    setStored(next);
    // Reflete a aba na URL → o link fica compartilhável e sobrevive ao refresh.
    navigate({ search: { [TAB_SEARCH_KEY]: next }, replace: true });
  };

  return (
    <AppShell>
      <div className="fade-up">
        <header className="mb-4">
          <h1 className="text-xl font-semibold text-aqua-text">Configurações</h1>
          <p className="text-sm text-aqua-text-muted">
            Sistema, hardware ESP32, equipe do projeto e diagnóstico operacional.
          </p>
        </header>
        <ConfigTabsView value={tab} onValueChange={handleChange} content={TAB_CONTENT} />
      </div>
    </AppShell>
  );
}
