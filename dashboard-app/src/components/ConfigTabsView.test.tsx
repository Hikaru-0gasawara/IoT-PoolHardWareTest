import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { ConfigTabsView } from "@/components/ConfigTabsView";
import { CONFIG_TABS, DEFAULT_CONFIG_TAB, type ConfigTab } from "@/lib/config.tabs";

// Teste de integração (E2E em jsdom) da navegação por abas de /config.
// Renderiza o componente real de abas (Radix) com conteúdos distintos e
// simula cliques do usuário, confirmando que o conteúdo exibido corresponde
// à aba selecionada — a mesma lógica vale para desktop e mobile, pois ambos
// usam o mesmo array CONFIG_TABS e o mesmo componente.

const CONTENT: Record<ConfigTab, React.ReactNode> = {
  "controle-avancado": <div>PAINEL_CONTROLE</div>,
  integracoes: <div>PAINEL_INTEGRACOES</div>,
  sobre: <div>PAINEL_SOBRE</div>,
};

function Harness({ initial }: { initial: ConfigTab }) {
  const [tab, setTab] = useState<ConfigTab>(initial);
  return <ConfigTabsView value={tab} onValueChange={setTab} content={CONTENT} />;
}

afterEach(cleanup);

describe("ConfigTabsView — navegação por abas", () => {
  it("renderiza as abas na ordem invertida (Controle Avançado antes de Sobre)", () => {
    render(<Harness initial={DEFAULT_CONFIG_TAB} />);
    const triggers = screen.getAllByRole("tab");
    expect(triggers.map((t) => t.textContent)).toEqual([
      "Controle Avançado",
      "Integrações",
      "Sobre",
    ]);
  });

  it("ao clicar em Controle Avançado e depois Sobre, mostra o conteúdo correto", async () => {
    const user = userEvent.setup();
    render(<Harness initial={DEFAULT_CONFIG_TAB} />);

    await user.click(screen.getByRole("tab", { name: "Controle Avançado" }));
    expect(screen.getByText("PAINEL_CONTROLE")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Sobre" }));
    expect(screen.getByText("PAINEL_SOBRE")).toBeInTheDocument();

    // Painel ativo corresponde à aba selecionada (aria-selected).
    expect(screen.getByRole("tab", { name: "Sobre" })).toHaveAttribute("aria-selected", "true");
  });

  it("abre direto na aba indicada por deep link (value inicial)", () => {
    render(<Harness initial="sobre" />);
    expect(screen.getByText("PAINEL_SOBRE")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Sobre" })).toHaveAttribute("aria-selected", "true");
  });

  it("a ordem das abas é a mesma fonte (CONFIG_TABS) usada em qualquer viewport", () => {
    render(<Harness initial={DEFAULT_CONFIG_TAB} />);
    const list = screen.getByRole("tablist");
    const triggers = within(list).getAllByRole("tab");
    expect(triggers.map((t) => t.textContent)).toEqual(CONFIG_TABS.map((t) => t.label));
  });
});
