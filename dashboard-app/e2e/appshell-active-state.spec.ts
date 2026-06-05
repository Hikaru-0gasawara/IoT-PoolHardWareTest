import { test, expect, type Page } from "@playwright/test";

/**
 * Suíte E2E para a navegação responsiva do AppShell.
 *
 * Cobre:
 *  1. Item "Configurações" do menu horizontal ativo em /config (≥ lg).
 *  2. Realce ativo de cada item do menu horizontal por breakpoint.
 *  3. Tempo de navegação entre / e /config/* por breakpoint.
 */
const HEIGHT = 900;

const navLink = (page: Page, label: string) => {
  const map: Record<string, string> = {
    "Visão Geral": "nav-link-home",
    Gráficos: "nav-link-graficos",
    Alertas: "nav-link-alertas",
    Configurações: "nav-link-config",
  };
  return page.getByTestId(map[label]);
};

const ALL_WIDTHS = [320, 375, 414, 640, 768, 834, 1023, 1024, 1280, 1440];

// ── 1. Realce ativo em /config/* por breakpoint ──────────────────────────────
test.describe("Realce ativo em /config/* por breakpoint", () => {
  const CONFIG_PATHS = ["/config", "/config/avancado"];

  for (const path of CONFIG_PATHS) {
    for (const width of [1024, 1280]) {
      test(`@ ${width}px em ${path} o item Configurações fica realçado`, async ({ page }) => {
        await page.setViewportSize({ width, height: HEIGHT });
        await page.goto(path);

        const menu = navLink(page, "Configurações");
        await expect(menu).toBeVisible();
        if (path === "/config") {
          await expect(menu).toHaveClass(/bg-aqua-surface-2/);
        } else {
          await expect(menu).not.toHaveClass(/bg-aqua-surface-2/);
        }
      });
    }
  }
});

// ── 2. Realce ativo dos itens do menu horizontal ─────────────────────────────
test.describe("Realce ativo dos itens do menu horizontal", () => {
  const ITEMS = [
    { to: "/", label: "Visão Geral" },
    { to: "/graficos", label: "Gráficos" },
    { to: "/alertas", label: "Alertas" },
  ] as const;

  for (const width of [1024, 1280]) {
    for (const item of ITEMS) {
      test(`@ ${width}px em ${item.to} o item "${item.label}" reflete o estado ativo`, async ({ page }) => {
        await page.setViewportSize({ width, height: HEIGHT });
        await page.goto(item.to);

        const link = navLink(page, item.label);
        await expect(link).toBeVisible();
        await expect(link).toHaveClass(/bg-aqua-surface-2/);
        await expect(link).toHaveClass(/text-aqua-text/);

        for (const other of ITEMS) {
          if (other.to === item.to) continue;
          await expect(navLink(page, other.label)).not.toHaveClass(/bg-aqua-surface-2/);
        }
      });

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

// ── 3. Tempo de navegação entre / e /config/* por breakpoint ────────────────
test.describe("Navegação entre / e /config/* em tempo aceitável (<2s)", () => {
  const MAX_MS = 2000;

  for (const width of [768, 1024, 1280]) {
    test(`@ ${width}px navegar / → /config → / fica abaixo de ${MAX_MS}ms`, async ({ page }) => {
      await page.setViewportSize({ width, height: HEIGHT });
      await page.goto("/");

      let start = Date.now();
      await page.goto("/config");
      if (width >= 1024) {
        await expect(navLink(page, "Configurações")).toBeVisible();
      }
      expect(Date.now() - start).toBeLessThan(MAX_MS);

      start = Date.now();
      await page.goto("/config/avancado");
      expect(Date.now() - start).toBeLessThan(MAX_MS);

      start = Date.now();
      await page.goto("/");
      await expect(navLink(page, "Visão Geral")).toHaveAttribute("data-active", "true");
      expect(Date.now() - start).toBeLessThan(MAX_MS);
    });
  }
});
