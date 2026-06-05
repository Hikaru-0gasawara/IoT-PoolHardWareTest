// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// host "0.0.0.0" (IPv4) — este ambiente não suporta o "::" (IPv6) padrão do
// wrapper. Fora do sandbox, options.vite tem precedência no merge final.
export default defineConfig({
  // Modo SPA: emite um index.html estático servível sem servidor SSR
  // (necessário para preview neste ambiente). Hidratação 100% no cliente.
  tanstackStart: { spa: { enabled: true } },
  vite: {
    server: { host: "127.0.0.1", port: 4173, strictPort: true },
    preview: { host: "127.0.0.1", port: 4173, strictPort: true },
  },
});
