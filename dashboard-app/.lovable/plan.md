
# Fork AquaSense — Cockpit + Tradução PT (execução completa)

Refatoração total do dashboard em uma tacada: tradução EN→PT (schemas, store, provider, hooks, componentes, microcopy), visual cockpit (paleta azul-noite + cyan/âmbar/magenta/lime, tipografia display mono), 3 adições de UX e 2 melhorias funcionais. Firmware (`main_pt.py`) já existe externamente — Lovable só toca dashboard.

## Escopo

**Muda:**
- Namespace MQTT: `aquasense-ibmec` → `aquasense-ibmec-pt`
- Tópicos: `data`→`dados`, `pool/*`→`piscina/*`, `solar/*`→`coletor/*`, `system/*`→`sistema/*`, `dosing/*`→`dosagem/*`, `control/*`→`controle/*`
- Schemas Zod: campos PT (`cloro`, `alcalinidade`, `temp_piscina`, `temp_coletor`, `umidade`, `bomba`, `modo`, `parada_emergencia`, `dose_em_andamento`)
- Enums: `automatico`, `iniciada`/`concluida`/`bloqueada`, `LIGADA`/`DESLIGADA`, razões PT (`tempo_morto`, `intertravamento_ph_cloro`, `limite_horario`, etc.)
- Identificadores TS: componentes (`AppShell`→`EstruturaApp`, `ParameterCard`→`CartaoParametro`, etc.), hooks (`useNow`→`useAgora`, `useControlState`→`useEstadoControle`, etc.), store (`poolStore`→`estadoPiscina`)
- Paleta `src/styles.css` cockpit (oklch tokens novos), tipografia display, layout 6 telas

**Não muda:**
- Engine MQTT (broker, portas, QoS, keepalive, retain, reconexão)
- Regras de negócio (anti-flap 3/5, anti-cycling 60s, 8 camadas de segurança)
- Stack (React 19, TanStack Router, Zustand, Tailwind v4, Recharts, Framer Motion, mqtt.js, Zod, Vitest, Bun)
- Nomes de rotas (`/`, `/graficos`, `/aquecimento`, `/alertas`, `/controle`, `/config`)

## Mockup descritivo

**EstruturaApp:**
```text
┌──────────────────────────────────────────────────────────┐
│ AQUASENSE  ◉ OPERACIONAL   atualizado há 3s · ciclo #142│  header bg-base, glow lime na pílula
├──────────────────────────────────────────────────────────┤
│ [BannerIncidente — só se E-Stop / cloro=0 / stale]      │  magenta pulsando
├──────────────────────────────────────────────────────────┤
│  Visão  Gráficos  Aquecimento  Alertas  Controle  Config│  nav uppercase tracking-wide
├──────────────────────────────────────────────────────────┤
│              < conteúdo da rota >                        │
└──────────────────────────────────────────────────────────┘
```

**Visão Geral:** painel solar full-width topo (piscina ⇄ bomba ⇄ coletor, setas cyan animadas se bomba ON, ΔT em display gigante) + linha de 4 `TileSensor` (pH · Cloro · Alcalinidade · Temp), cada um com valor display, sparkline 60pts, glow por status, calibração inline.

## Etapas (executadas em sequência neste turno)

### Etapa 1 — Setup
1. Copiar glossário para `docs/Glossario.md`
2. Reescrever `src/styles.css` com paleta cockpit (`--bg-base`, `--accent-cyan/amber/magenta/lime`, `--glow-*`, `--param-*`)
3. Adicionar fontes (JetBrains Mono via Google Fonts, Inter mantém), classes `.text-display-large`, `.text-label`

### Etapa 2 — Schema MQTT + tipos + store
1. `src/lib/mqttTopics.ts` — namespace e tópicos PT
2. `src/types/firmware.ts` — schemas Zod com campos PT, enums PT, novo campo `fonte` opcional em `EsquemaEventoDosagem`
3. `src/store/poolStore.ts` → `src/store/estadoPiscina.ts` — chaves PT, derivação `cloroEmErro` (3+ ciclos com cloro=0), `ultimaDosePorProduto`
4. `src/providers/MqttProvider.tsx` → `ProvedorMqtt` — parsing PT, publish em `controle/modo` e `dosagem/comando` com payloads PT
5. `src/lib/mqttStatus.ts` → `descreverStatusMqtt`, `temFirmwareAoVivo`
6. Hooks: `useAquaSense.ts` (mantém nome), `useControlState`→`useEstadoControle`, `useDosingEvents`→`useEventosDosagem`, `useSystemHealth`→`useSaudeSistema`, `useNow`→`useAgora`
7. Atualizar testes existentes (61 → traduzidos)

### Etapa 3 — Componentes cockpit novos
- `PilulaStatus` (5 estados com glow), `BannerIncidente`, `UltimaAtualizacao`, `TileSensor`, `MiniDashboard`, `IndicadorTendencia`, `BarraHisterese`
- `EstruturaApp` (refator de `AppShell`)

### Etapa 4 — 6 telas
- `/`: mosaico (painel solar + 4 TileSensor)
- `/graficos`: 2×2 MiniDashboard (60 pts, sai histórico 24h — justificativa "Fase 3" no roadmap)
- `/aquecimento`: tile bomba + BarraHisterese + FIFO acionamentos
- `/alertas`: 3 estados visuais (ativo magenta pulsando / reconhecido âmbar / resolvido subtle) + filtros pílulas
- `/controle`: 4 tiles status + toggle Auto/Manual + 3 BotaoSegurar SCADA + lista FIFO eventos com ícone fonte (🤖/👤/—)
- `/config`: 3 abas pílulas (Sobre/Diagnóstico/Roadmap)
- Microinterações: pulse no número (200ms), glow em status, fluxo cyan animado bomba ON, transições 400ms

### Etapa 5 — Adições, melhorias, validação
1. **Cloro=0 erro:** card "ERRO", banner se >30s, dose cloro desabilitada com tooltip
2. **UltimaAtualizacao:** integrada no header (cores por idade)
3. **Aguardando primeiro ciclo:** tiles "—" + texto, transição 400ms na primeira mensagem
4. **Campo `fonte`:** exibir "🤖 Auto" / "👤 Manual" / "—" na lista de eventos
5. **Última dose por produto:** "última há 1h 23m" usando `useAgora()`
6. **Testes novos:** `cloroEmErro` ativa/desativa, `ultimaDose` correto, `fonte` propaga → meta 65+ verdes
7. **Validação:** `grep -rE "(chlorine|alkalinity|cycle|temp_pool|temp_solar|humidity|pump|estop|dose_in_progress)" src/` → vazio (exceto allowlist do glossário); mobile 375px nas 6 telas

## Detalhes técnicos

- **`src/routeTree.gen.ts` é auto-gerado** — não editar manualmente
- **Sem `as Type` / casts** em hooks TanStack Router — deixar inferência fluir
- **Compat curto:** durante Etapa 2, manter re-exports dos nomes antigos por algumas operações para não quebrar imports não-migrados; remover ao fim
- **Risco principal:** ordem importa. Schemas EN com firmware PT silenciam tudo (Zod rejeita) — daí Etapa 2 vir antes de Etapa 4
- **Fora de escopo:** firmware (`main_pt.py` já gerado fora), refator não-bloqueante do firmware (Fase 3), histórico longo 24h (justificado como auditoria de produção)
- **Tema:** dark cockpit fixo neste fork (sem light theme)
