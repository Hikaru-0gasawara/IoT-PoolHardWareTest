import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

// Config dedicada do vitest — separada do vite.config.ts (que é wrapper
// do @lovable.dev/vite-tanstack-config e injeta plugins SSR/Cloudflare
// que não fazem sentido no test runner).
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    css: false,
  },
});