# index.js — Handlers da Skill Alexa

Ponto de entrada da skill **Monitor da Piscina AquaSense** (custom, Alexa-hosted Node.js, pt-BR). Registra todos os handlers de intent e exporta a função Lambda via `ask-sdk-core`.

---

## Invocação

| Frase | O que acontece |
|---|---|
| "Alexa, abrir monitor da piscina" | Abre a skill (`LaunchRequest`) |
| "Alexa, pergunte ao monitor da piscina qual o pH" | `ConsultarParametroIntent` |
| "Alexa, peça ao monitor da piscina para dosar cloro" | `DosarIntent` (inicia diálogo) |

---

## Handlers

### `LaunchRequestHandler`

Ativado quando o usuário abre a skill sem especificar uma ação. Responde com uma saudação e lista exemplos do que é possível perguntar.

---

### `ConsultarParametroHandler` — `ConsultarParametroIntent`

Lê o snapshot retido (`lerSnapshot`) e responde o valor do parâmetro solicitado com o status de faixa.

**Parâmetros suportados:**

| Slot `parametro` | Campo JSON | Faixas ideais |
|---|---|---|
| `ph` | `ph` | 7,2 – 7,6 |
| `cloro` | `cloro` | 1,0 – 3,0 ppm |
| `alcalinidade` | `alcalinidade` | 80 – 120 ppm |
| `orp` | `orp_mv` | sem faixa |
| `umidade` | `umidade` | sem faixa |

**Exemplo de resposta:** *"O pH está em 7,4, dentro da faixa ideal."*

---

### `ConsultarTemperaturaHandler` — `ConsultarTemperaturaIntent`

Lê `temp_piscina`, `temp_coletor` e `delta_t` do snapshot.

| Slot `local` | Resposta |
|---|---|
| `piscina` | Temperatura da piscina |
| `coletor` | Temperatura do coletor solar |
| (sem local) | Ambas + diferença ΔT |

---

### `ResumoHandler` — `ResumoIntent`

Lê o snapshot e responde pH, cloro, alcalinidade, temperatura da piscina, estado da bomba e lista de alertas ativos.

---

### `StatusBombaHandler` — `StatusBombaIntent`

Responde se a bomba do coletor solar está ligada ou desligada, e informa o ΔT de temperatura atual.

---

### `DosarHandler` — `DosarIntent`

Envia um comando de dosagem para o firmware via `bridge.publicar("dosagem/comando", { parametro })`.

**Fluxo de diálogo obrigatório:**

1. Alexa elicita o slot `quimico` se não foi informado.
2. Alexa pede confirmação por voz: *"Você quer mesmo iniciar a dosagem de cloro?"*
3. Se confirmado → publica o comando.
4. Se negado → responde *"Tudo bem, não vou dosar nada."*

**Produtos suportados:** `cloro`, `acido`, `base`

> O firmware ainda aplica suas próprias travas (parada de emergência, dose em andamento). A skill confirma apenas o **envio** do comando.

---

### `DefinirModoHandler` — `DefinirModoIntent`

Publica `{ modo }` em `controle/modo`.

| Modo | Comportamento no firmware |
|---|---|
| `automatico` | Controle automático por ΔT |
| `manual` | Aguarda comandos externos |
| `parada` | Bloqueia dosagens, parada de emergência |

---

### Handlers padrão

| Handler | Intent | Comportamento |
|---|---|---|
| `HelpHandler` | `AMAZON.HelpIntent` | Lista as ações disponíveis |
| `CancelStopHandler` | `AMAZON.CancelIntent` / `StopIntent` | Encerra a sessão |
| `FallbackHandler` | `AMAZON.FallbackIntent` | Orienta o usuário |
| `SessionEndedHandler` | `SessionEndedRequest` | Limpeza silenciosa |
| `ErrorHandler` | qualquer erro | Responde com mensagem genérica e loga o erro |

---

## Utilitários

### `resolverSlot(handlerInput, nomeSlot)`

Retorna o **id canônico** do slot via resolução de sinônimos (campo `id` da entidade), ou o valor falado em minúsculas como fallback. Garante que sinônimos como "hipoclorito" sejam resolvidos para `"cloro"`.

### `statusFaixa(valor, min, max)`

Retorna `"abaixo do ideal"`, `"acima do ideal"` ou `"dentro da faixa ideal"`. Retorna `null` quando `min === null` (parâmetros sem faixa definida, como ORP).

### `ehErroSensor(v)`

Retorna `true` se o valor não é número ou é ≤ −50 (sentinela de erro do firmware, que usa −99 para leitura falha).

### `num(v, dec)`

Formata número com `dec` casas decimais e vírgula como separador (pt-BR). Ex.: `7.4` → `"7,4"`.

---

## Constante `ERRO_OFFLINE`

Mensagem falada quando `lerSnapshot()` lança exceção (ESP32 offline ou broker inacessível):

> *"Não consegui falar com o sistema da piscina agora. Verifique se o ESP32 está ligado e conectado ao broker."*

---

## Dependências

| Pacote | Uso |
|---|---|
| `ask-sdk-core` | SDK oficial da Alexa — `SkillBuilders`, `getRequestType`, `getSlot`, etc. |
| `./mqtt-bridge` | `lerSnapshot()` e `publicar()` |
