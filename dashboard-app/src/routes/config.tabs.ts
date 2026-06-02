// Ordem canônica das abas da página de Configurações.
// Regra definida: "Controle Avançado" SEMPRE aparece ANTES de "Sobre".
// Esta é a fonte única de verdade — a UI (config.tsx / ConfigTabsView) renderiza
// a partir deste array e os testes garantem a ordem e os deep links.

export type ConfigTab = "controle-avancado" | "diagnostico" | "sobre";

export interface ConfigTabDef {
  value: ConfigTab;
  label: string;
}

export const CONFIG_TABS: readonly ConfigTabDef[] = [
  { value: "controle-avancado", label: "Controle Avançado" },
  { value: "diagnostico", label: "Diagnóstico" },
  { value: "sobre", label: "Sobre" },
] as const;

// Aba padrão ao abrir /config (primeira da ordem canônica).
export const DEFAULT_CONFIG_TAB: ConfigTab = CONFIG_TABS[0].value;

export const isConfigTab = (v: unknown): v is ConfigTab =>
  CONFIG_TABS.some((t) => t.value === v);

// ---------------------------------------------------------------------------
// Deep links: /config?tab=<aba>
// O search param `tab` permite compartilhar/abrir direto numa aba específica.
// `parseTabParam` aceita o valor cru da URL e devolve uma aba válida ou null.
// ---------------------------------------------------------------------------
export const TAB_SEARCH_KEY = "tab" as const;

export function parseTabParam(raw: unknown): ConfigTab | null {
  return isConfigTab(raw) ? raw : null;
}

// Prioridade de resolução da aba inicial:
//   1) deep link na URL (?tab=) — sempre vence (compartilhar/refresh com link)
//   2) última aba persistida em localStorage
//   3) aba padrão (Controle Avançado)
export function resolveInitialTab(
  searchTab: unknown,
  storedTab: unknown,
): ConfigTab {
  return parseTabParam(searchTab) ?? parseTabParam(storedTab) ?? DEFAULT_CONFIG_TAB;
}
