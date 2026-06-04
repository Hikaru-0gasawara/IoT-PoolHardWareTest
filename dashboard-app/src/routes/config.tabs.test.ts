import { describe, it, expect } from "vitest";
import {
  CONFIG_TABS,
  DEFAULT_CONFIG_TAB,
  isConfigTab,
  parseTabParam,
  resolveInitialTab,
} from "@/routes/config.tabs";

// Regra de negócio: na página /config, a aba "Controle Avançado" deve SEMPRE
// aparecer ANTES da aba "Sobre". A UI renderiza a partir de CONFIG_TABS, então
// garantir a ordem aqui garante a ordem visual no desktop e no mobile (mesmo array).

describe("ordem das abas de /config", () => {
  const valores = CONFIG_TABS.map((t) => t.value);
  const idxControle = valores.indexOf("controle-avancado");
  const idxSobre = valores.indexOf("sobre");

  it("inclui as abas controle-avancado e sobre", () => {
    expect(idxControle).toBeGreaterThanOrEqual(0);
    expect(idxSobre).toBeGreaterThanOrEqual(0);
  });

  it("Controle Avançado aparece antes de Sobre", () => {
    expect(idxControle).toBeLessThan(idxSobre);
  });

  it("a ordem renderizada é exatamente controle-avancado, integracoes, sobre", () => {
    expect(valores).toEqual(["controle-avancado", "integracoes", "sobre"]);
  });

  it("os rótulos seguem a mesma ordem invertida", () => {
    expect(CONFIG_TABS.map((t) => t.label)).toEqual([
      "Controle Avançado",
      "Integrações",
      "Sobre",
    ]);
  });

  it("a aba padrão é a primeira da ordem (Controle Avançado)", () => {
    expect(DEFAULT_CONFIG_TAB).toBe("controle-avancado");
    expect(DEFAULT_CONFIG_TAB).toBe(CONFIG_TABS[0].value);
  });

  it("isConfigTab valida apenas as abas conhecidas", () => {
    expect(isConfigTab("sobre")).toBe(true);
    expect(isConfigTab("controle-avancado")).toBe(true);
    expect(isConfigTab("integracoes")).toBe(true);
    expect(isConfigTab("inexistente")).toBe(false);
  });
});

describe("deep links de /config (?tab=)", () => {
  it("parseTabParam aceita abas válidas e rejeita o resto", () => {
    expect(parseTabParam("sobre")).toBe("sobre");
    expect(parseTabParam("controle-avancado")).toBe("controle-avancado");
    expect(parseTabParam("integracoes")).toBe("integracoes");
    expect(parseTabParam("xpto")).toBeNull();
    expect(parseTabParam(undefined)).toBeNull();
    expect(parseTabParam(123)).toBeNull();
  });

  it("deep link na URL vence a preferência persistida (refresh/compartilhar)", () => {
    // Abrir /config?tab=sobre deve cair em "sobre" mesmo com outra aba salva.
    expect(resolveInitialTab("sobre", "controle-avancado")).toBe("sobre");
    expect(resolveInitialTab("controle-avancado", "sobre")).toBe("controle-avancado");
  });

  it("sem deep link, usa a preferência persistida", () => {
    expect(resolveInitialTab(undefined, "sobre")).toBe("sobre");
  });

  it("sem deep link nem preferência válida, usa a aba padrão", () => {
    expect(resolveInitialTab(undefined, undefined)).toBe(DEFAULT_CONFIG_TAB);
    expect(resolveInitialTab("invalido", "tambem-invalido")).toBe(DEFAULT_CONFIG_TAB);
  });
});
