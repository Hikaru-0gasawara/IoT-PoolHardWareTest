import { test, expect, type Page } from "@playwright/test";

/**
 * Suíte E2E complementar para a navegação responsiva do AppShell.
 *
 * Cobre três garantias visuais:
 *  1. Engrenagem (/config) e o item "Configurações" do menu horizontal nunca
 *     aparecem simultaneamente em nenhuma largura entre 320px e 1440px,
 *     incluindo a transição crítica 1023px → 1024px (Tailwind `lg`).
 *  2. Ao navegar para /config/*, a engrenagem (abaixo de lg) ou o item de menu
 *     (a partir de lg) recebem as classes de realce de rota ativa.
 *  3. Cada item do menu horizontal (/, /graficos, /controle, /alertas) recebe
 *     as classes de estado ativo nos breakpoints 320/768/1023/1024px.
 *
 * Em falhas, o Playwright captura screenshot + vídeo automaticamente
 * (ver playwright.config.ts) para facilitar a depuração visual.
 */
const HEIGHT = 900;

const gearLocator = (page: Page) => page.getByTestId("gear-config");

const navLink = (page: Page, label: string) => {
  const map: Record<string, string> = {
    "Visão Geral": "nav-link-home",
    Gráficos: "nav-link-graficos",
    Aquecimento: "nav-link-controle",
    Alertas: "nav-link-alertas",
    Configurações: "nav-link-config",
  };
  return page.getByTestId(map[label]);
};

// Larguras cobrindo todo o intervalo 320–1440px, com foco na fronteira lg.
const ALL_WIDTHS = [320, 375, 414, 640, 768, 834, 1023, 1024, 1280, 1440];

// ── 1. Exclusividade mútua engrenagem × menu Configurações ──────────────────
test.describe("Exclusividade engrenagem × menu Configurações (320–1440px)", () => {
  for (const width of ALL_WIDTHS) {
    test(`@ ${width}px apenas um acesso a /config está visível`, async ({ page }) => {
      await page.setViewportSize({ width, height: HEIGHT });
      await page.goto("/");

      const gear = gearLocator(page);
      const menu = navLink(page, "Configurações");
      const below = width < 1024;

      if (below) {
        await expect(gear).toBeVisible();
        await expect(menu).toBeHidden();
      } else {
        await expect(gear).toBeHidden();
        await expect(menu).toBeVisible();
      }

      // Garantia explícita: nunca ambos ao mesmo tempo.
      const bothVisible =
        (await gear.isVisible()) && (await menu.isVisible());
      expect(bothVisible).toBe(false);
    });
  }

  test("transição 1023px → 1024px troca engrenagem por menu", async ({ page }) => {
    await page.goto("/");

    await page.setViewportSize({ width: 1023, height: HEIGHT });
    await expect(gearLocator(page)).toBeVisible();
    await expect(navLink(page, "Configurações")).toBeHidden();

    await page.setViewportSize({ width: 1024, height: HEIGHT });
    await expect(gearLocator(page)).toBeHidden();
    await expect(navLink(page, "Configurações")).toBeVisible();
  });
});

// ── 2. Realce de rota ativa em /config/* por breakpoint ─────────────────────
test.describe("Realce ativo em /config/* por breakpoint", () => {
  const CONFIG_PATHS = ["/config", "/config/avancado"];

  for (const path of CONFIG_PATHS) {
    for (const width of [320, 768, 1023, 1024]) {
      test(`@ ${width}px em ${path} o acesso a /config fica realçado`, async ({ page }) => {
        await page.setViewportSize({ width, height: HEIGHT });
        await page.goto(path);

        if (width < 1024) {
          // Abaixo de lg: a engrenagem assume e deve estar realçada.
          const gear = gearLocator(page);
          await expect(gear).toBeVisible();
          await expect(gear).toHaveClass(/text-aqua-accent/);
        } else {
          // A partir de lg: o item do menu fica ativo apenas em /config exato.
          const menu = navLink(page, "Configurações");
          await expect(menu).toBeVisible();
          if (path === "/config") {
            await expect(menu).toHaveClass(/bg-aqua-surface-2/);
          } else {
            // Sub-rota não acende o item (match exato na nav).
            await expect(menu).not.toHaveClass(/bg-aqua-surface-2/);
          }
        }
      });
    }
  }
});

// ── 3. Realce ativo em cada item do menu horizontal ─────────────────────────
test.describe("Realce ativo dos itens do menu horizontal", () => {
  const ITEMS = [
    { to: "/", label: "Visão Geral" },
    { to: "/graficos", label: "Gráficos" },
    { to: "/controle", label: "Aquecimento" },
    { to: "/alertas", label: "Alertas" },
  ] as const;

  for (const width of [320, 768, 1023, 1024]) {
    for (const item of ITEMS) {
      test(`@ ${width}px em ${item.to} o item "${item.label}" reflete o estado ativo`, async ({ page }) => {
        await page.setViewportSize({ width, height: HEIGHT });
        await page.goto(item.to);

        const link = navLink(page, item.label);

        if (width >= 1024) {
          // Menu horizontal visível: o item da rota atual fica realçado.
          await expect(link).toBeVisible();
          await expect(link).toHaveClass(/bg-aqua-surface-2/);
          await expect(link).toHaveClass(/text-aqua-text/);

          // Os demais itens não recebem o realce ativo.
          for (const other of ITEMS) {
            if (other.to === item.to) continue;
            await expect(navLink(page, other.label)).not.toHaveClass(
              /bg-aqua-surface-2/,
            );
          }
        } else {
          // Abaixo de lg o menu horizontal está oculto.
          await expect(link).toBeHidden();
        }
      });

      // Verificação independente de estilo: o atributo data-active reflete a
      // rota atual em TODOS os itens do menu, mesmo nos breakpoints em que o
      // menu está oculto (o atributo existe no DOM independente da visibilidade).
      test(`@ ${width}px em ${item.to} o data-active está correto em todos os itens`, async ({ page }) => {
        await page.setViewportSize({ width, height: HEIGHT });
        await page.goto(item.to);

        for (const other of ITEMS) {
          const link = navLink(page, other.label);
          const expected = other.to === item.to ? "true" : "false";
          await expect(link).toHaveAttribute("data-active", expected);
        }
      });
    }
  }
});

// ── 4. Tempo de navegação entre / e /config/* por breakpoint ────────────────
test.describe("Navegação entre / e /config/* em tempo aceitável (<2s)", () => {
  const MAX_MS = 2000;

  for (const width of [320, 768, 1023, 1024]) {
    test(`@ ${width}px navegar / → /config → / fica abaixo de ${MAX_MS}ms`, async ({ page }) => {
      await page.setViewportSize({ width, height: HEIGHT });
      await page.goto("/");

      // / → /config
      let start = Date.now();
      await page.goto("/config");
      await expect(
        width < 1024 ? gearLocator(page) : navLink(page, "Configurações"),
      ).toBeVisible();
      expect(Date.now() - start).toBeLessThan(MAX_MS);

      // /config → /config/avancado (sub-rota)
      start = Date.now();
      await page.goto("/config/avancado");
      expect(Date.now() - start).toBeLessThan(MAX_MS);

      // /config/* → /
      start = Date.now();
      await page.goto("/");
      await expect(navLink(page, "Visão Geral")).toHaveAttribute(
        "data-active",
        "true",
      );
      expect(Date.now() - start).toBeLessThan(MAX_MS);
    });
  }
});

