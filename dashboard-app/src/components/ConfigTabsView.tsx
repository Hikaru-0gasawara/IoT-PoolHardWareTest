import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CONFIG_TABS, isConfigTab, type ConfigTab } from "@/routes/config.tabs";

// Componente apresentacional das abas de /config. Sem dependência de router
// nem de store — recebe a aba ativa, o callback de mudança e o conteúdo de
// cada aba. Isso o torna testável de forma isolada (integração/E2E em jsdom),
// e garante que a ORDEM visual venha sempre de CONFIG_TABS (fonte única).
export function ConfigTabsView({
  value,
  onValueChange,
  content,
}: {
  value: ConfigTab;
  onValueChange: (tab: ConfigTab) => void;
  content: Record<ConfigTab, React.ReactNode>;
}) {
  return (
    <Tabs
      value={value}
      onValueChange={(v) => isConfigTab(v) && onValueChange(v)}
      className="space-y-4"
    >
      {/* Mobile: scroll horizontal nativo se as abas ficarem apertadas em 375px.
          Mesmo array renderiza desktop e mobile → ordem idêntica. */}
      <div className="-mx-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <TabsList className="bg-aqua-surface inline-flex w-auto min-w-full sm:min-w-0">
          {CONFIG_TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value} className="min-h-[44px] sm:min-h-0">
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {CONFIG_TABS.map((t) => (
        <TabsContent key={t.value} value={t.value} className="mt-0">
          {content[t.value]}
        </TabsContent>
      ))}
    </Tabs>
  );
}
