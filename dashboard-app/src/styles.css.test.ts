import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { transform } from "lightningcss";

// Guarda de regressão de CSS:
// Compila o src/styles.css com o mesmo motor (Lightning CSS) usado no build de
// produção. Pega erros do tipo "@import rules must precede all rules" e qualquer
// outra falha de compilação ANTES de chegar ao preview/produção — sem precisar
// rodar o `vite build` completo.

const cssPath = resolve(dirname(fileURLToPath(import.meta.url)), "styles.css");

describe("src/styles.css", () => {
  const source = readFileSync(cssPath, "utf8");

  it("todas as regras @import vêm antes de qualquer outra regra (exceto @layer/@charset)", () => {
    // Remove comentários e linhas em branco, mantém apenas declarações de topo.
    const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, "");
    const topLevelStatements = withoutComments
      .split(/[\n{]/)
      .map((line) => line.trim())
      .filter(Boolean);

    let seenNonImport = false;
    for (const stmt of topLevelStatements) {
      const isImport = stmt.startsWith("@import");
      const isAllowedBefore =
        stmt.startsWith("@charset") ||
        stmt.startsWith("@layer") ||
        stmt.startsWith("@custom-variant") ||
        stmt.startsWith("@source");

      if (isImport) {
        expect(
          seenNonImport,
          `@import "${stmt}" aparece depois de outra regra — Lightning CSS vai falhar no build`,
        ).toBe(false);
      } else if (!isAllowedBefore) {
        seenNonImport = true;
      }
    }
  });

  it("não usa @import url() remoto (deve ser carregado via <link> no __root.tsx)", () => {
    expect(
      /@import\s+url\(\s*["']?https?:/i.test(source),
      "@import url(remoto) faz o Lightning CSS tentar resolver a URL como arquivo (ENOENT). Use <link rel=stylesheet> no head.",
    ).toBe(false);
  });

  it("compila sem erros no Lightning CSS (mesmo motor do build)", () => {
    // Substitui imports de pacotes (resolvidos pelo Tailwind/Vite, não pelo
    // Lightning CSS isolado) por placeholders, preservando a posição/ordem real.
    const compilable = source.replace(
      /@import\s+(["'][^"']+["'][^;]*);/g,
      "@layer __pkg;",
    );

    expect(() =>
      transform({
        filename: "styles.css",
        code: Buffer.from(compilable),
        minify: false,
      }),
    ).not.toThrow();
  });
});
