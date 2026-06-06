# .github/ — Automação (GitHub Actions)

## workflows/ci.yml — CI

Executa em **push** e **pull request** para `main`. Todos os passos `run` rodam dentro de
`dashboard-app/` (via `defaults.run.working-directory`).

| Passo | Comando | Falha quando… |
|---|---|---|
| Setup Bun | `oven-sh/setup-bun@v2` | — |
| Install | `bun install` | dependências não resolvem |
| Lint | `bun run lint` (`eslint .`) | erro de lint ou formatação (prettier) |
| Testes | `bun run test` (`vitest run`) | algum teste unitário/integração falha |
| Build | `bun run build` | erro de compilação ou de CSS (Tailwind v4 / Lightning CSS) |

O objetivo é barrar regressões antes do merge: qualquer erro de compilação, import de CSS fora de
ordem, lint ou teste quebrado falha o job.

> O firmware (`AquaSense/`, `wokwi/`) **não** é compilado no CI — o pipeline cobre apenas o
> `dashboard-app/`.
