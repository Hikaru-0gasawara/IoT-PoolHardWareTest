// Pós-build para hospedagem estática (Cloudflare Pages, Netlify, Vercel, etc.).
//
// O TanStack Start em modo SPA emite o shell da aplicação como `_shell.html`.
// O servidor de dev do Vite sabe usá-lo automaticamente, mas hosts estáticos
// servem `index.html` na raiz — sem ele, a home retorna 404.
//
// Este script:
//   1. Copia `_shell.html` → `index.html` (entrada que os hosts esperam)
//   2. Cria `_redirects` com fallback de SPA, para que deep links e refresh
//      em rotas como /config ou /alertas sirvam o app em vez de 404.
//
// Roda automaticamente após `vite build` (ver script "build" no package.json).

import { copyFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const dir = resolve("dist/client");
const shell = resolve(dir, "_shell.html");
const index = resolve(dir, "index.html");

if (!existsSync(shell)) {
  console.warn("[postbuild-spa] dist/client/_shell.html não encontrado — nada a fazer.");
  process.exit(0);
}

copyFileSync(shell, index);
writeFileSync(resolve(dir, "_redirects"), "/* /index.html 200\n");

console.log("[postbuild-spa] index.html + _redirects gerados para hospedagem estática.");
