import { defineConfig, devices } from "@playwright/test";

/**
 * Configuração E2E do AppShell — valida visualmente a navegação e o
 * realce de estado ativo nas larguras de fronteira (320–1440px).
 *
 * Captura automática em falha:
 *   screenshot: "only-on-failure" — PNG salvo em test-results/ ao falhar.
 *   video:      "retain-on-failure" — vídeo webm retido apenas em falha;
 *               descartado quando o teste passa (não infla CI).
 *
 * Rode com: `npm run test:e2e` (requer `npx playwright install` uma vez).
 * O webServer sobe o preview do build automaticamente.
 */
const PORT = Number(process.env.E2E_PORT ?? 4173);
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    // Captura screenshot PNG apenas quando o teste falha.
    screenshot: "only-on-failure",
    // Grava vídeo do teste; descarta se passar (retém só em falha).
    video: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run preview -- --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
