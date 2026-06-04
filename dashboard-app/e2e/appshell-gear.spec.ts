import { test, expect } from "@playwright/test";

/**
 * Validação E2E do AppShell — navegação responsiva, engrenagem vs. menu
 * de Configurações, classes de realce de estado ativo em todos os breakpoints.
 *
 * Regra visual:
 *   < 1024px  → engrenagem (aria-label "Abrir configurações") visível;
 *               link "Configurações" no nav horizontal OCULTO.
 *  >= 1024px  → engrenagem OCULTA; link "Configurações" no nav visível.
 *   Os dois NUNCA coexistem.
 *
 * Screenshots são tirados em cada asserção visual; vídeo é retido em falha
 * (playwright.config.ts: screenshot "only-on-failure", video "retain-on-failure").
 */

const HEIGHT = 900;

const BREAKPOINTS = [
  { width: 320,  gearVisible: true  },
  { width: 768,  gearVisible: true  },
  { width: 1023, gearVisible: true  },
  { width: 1024, gearVisible: false },
  { width: 1440, gearVisible: false },
] as const;

const gear = (page: import("@playwright/test").Page) =>
  page.getByLabel("Abrir configurações");

const navConfigLink = (page: import("@playwright/test").Page) =>
  page.locator("header nav a", { hasText: "Configurações" });

const navLink = (page: import("@playwright/test").Page, label: string) =>
  page.locator("header nav a", { hasText: label });

const NAV_ROUTES = [
  { path: "/",         label: "Início"   },
  { path: "/graficos", label: "Gráficos" },
  { path: "/controle", label: "Controle" },
  { path: "/alertas",  label: "Alertas"  },
] as const;

// ──────────────────────────────────────────────────────────────────────────
// 1. Mutex: engrenagem e menu Configurações nunca coexistem (320–1440px)
// ──────────────────────────────────────────────────────────────────────────

for (const { width, gearVisible } of BREAKPOINTS) {
  test.describe(`mutex engrenagem/menu @ ${width}px`, () => {
    test.use({ viewport: { width, height: HEIGHT } });

    test("engrenagem e Configurações são mutuamente exclusivos", async ({ page }) => {
      await page.goto("/");

      if (gearVisible) {
        await expect(gear(page)).toBeVisible();
        await expect(navConfigLink(page)).toBeHidden();
      } else {
        await expect(gear(page)).toBeHidden();
        await expect(navConfigLink(page)).toBeVisible();
      }

      await expect(page.locator("header").first()).toHaveScreenshot(
        `header-mutex-${width}.png`,
      );
    });
  });
}

// ──────────────────────────────────────────────────────────────────────────
// 2. Transição crítica 1023 → 1024px
// ──────────────────────────────────────────────────────────────────────────

test.describe("transição 1023 → 1024px", () => {
  test("a 1023px engrenagem visível, nav-config oculto", async ({ page }) => {
    await page.setViewportSize({ width: 1023, height: HEIGHT });
    await page.goto("/");
    await expect(gear(page)).toBeVisible();
    await expect(navConfigLink(page)).toBeHidden();
    await expect(page.locator("header").first()).toHaveScreenshot("header-1023-transition.png");
  });

  test("a 1024px engrenagem oculta, nav-config visível", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: HEIGHT });
    await page.goto("/");
    await expect(gear(page)).toBeHidden();
    await expect(navConfigLink(page)).toBeVisible();
    await expect(page.locator("header").first()).toHaveScreenshot("header-1024-transition.png");
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 3. Classes de realce ao navegar para /config/*
// ──────────────────────────────────────────────────────────────────────────

for (const { width, gearVisible } of BREAKPOINTS) {
  test.describe(`realce /config @ ${width}px`, () => {
    test.use({ viewport: { width, height: HEIGHT } });

    if (gearVisible) {
      test("engrenagem ativa recebe text-aqua-accent", async ({ page }) => {
        await page.goto("/config");
        await expect(gear(page)).toBeVisible();
        await expect(gear(page)).toHaveClass(/text-aqua-accent/);
        await expect(page.locator("header").first()).toHaveScreenshot(
          `header-config-gear-${width}.png`,
        );
      });
    } else {
      test("link Configurações ativo recebe bg-aqua-surface-2", async ({ page }) => {
        await page.goto("/config");
        await expect(navConfigLink(page)).toBeVisible();
        await expect(navConfigLink(page)).toHaveClass(/bg-aqua-surface-2/);
        await expect(page.locator("header").first()).toHaveScreenshot(
          `header-config-nav-${width}.png`,
        );
      });
    }
  });
}

// ──────────────────────────────────────────────────────────────────────────
// 4. Classes de realce do estado ativo em cada item de menu
//    Breakpoints: 320, 768, 1023 (mobile) e 1024 (desktop)
// ──────────────────────────────────────────────────────────────────────────

const MENU_BREAKPOINTS = [320, 768, 1023, 1024] as const;

for (const width of MENU_BREAKPOINTS) {
  test.describe(`realce itens de menu @ ${width}px`, () => {
    test.use({ viewport: { width, height: HEIGHT } });

    if (width >= 1024) {
      for (const { path, label } of NAV_ROUTES) {
        test(`link "${label}" ativo ao navegar para ${path}`, async ({ page }) => {
          await page.goto(path);
          const link = navLink(page, label);
          await expect(link).toBeVisible();
          await expect(link).toHaveClass(/bg-aqua-surface-2/);
          await expect(page.locator("header").first()).toHaveScreenshot(
            `header-active-${label.toLowerCase()}-${width}.png`,
          );
        });
      }
    } else {
      // Mobile: nav horizontal ausente — valida que nenhum item está visível.
      test("nav horizontal oculto abaixo de 1024px", async ({ page }) => {
        await page.goto("/");
        for (const { label } of NAV_ROUTES) {
          await expect(navLink(page, label)).toBeHidden();
        }
      });
    }
  });
}
