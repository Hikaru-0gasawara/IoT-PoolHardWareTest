# pt-BR.json — Modelo de Interação (Alexa, Português BR)

Modelo de linguagem natural da skill **Monitor da Piscina AquaSense** para o locale `pt-BR`. Define intents, slots, sinônimos e o modelo de diálogo (elicitação e confirmação).

---

## Invocação

```
"monitor da piscina"
```

Exemplos:
- *"Alexa, abrir monitor da piscina"*
- *"Alexa, pergunte ao monitor da piscina qual o pH"*
- *"Alexa, peça ao monitor da piscina para dosar cloro"*

---

## Intents customizados

### `ConsultarParametroIntent`

Consulta um parâmetro químico da água.

**Slot:** `parametro` (tipo `PARAMETRO`)

**Frases de exemplo:**
- *"qual o pH"*
- *"qual o cloro da água"*
- *"como está a alcalinidade"*
- *"o ORP está bom"*

---

### `ConsultarTemperaturaIntent`

Consulta a temperatura da piscina e/ou do coletor solar.

**Slot:** `local` (tipo `LOCAL_TEMP`, opcional)

**Frases de exemplo:**
- *"qual a temperatura"*
- *"qual a temperatura da piscina"*
- *"quantos graus está o coletor"*
- *"está quente a água"*

---

### `ResumoIntent`

Solicita um resumo completo do estado da piscina.

**Frases de exemplo:**
- *"como está a água"*
- *"como está a piscina"*
- *"me dê um resumo"*
- *"status da piscina"*

---

### `StatusBombaIntent`

Consulta o estado da bomba do coletor solar.

**Frases de exemplo:**
- *"a bomba está ligada"*
- *"qual o estado da bomba"*
- *"o aquecimento está ligado"*

---

### `DosarIntent`

Envia um comando de dosagem química. **Requer confirmação por voz** antes de executar.

**Slot:** `quimico` (tipo `QUIMICO`, elicitação obrigatória)

**Frases de exemplo:**
- *"dose cloro"*
- *"adicione ácido"*
- *"iniciar dosagem de base"*
- *"coloque cloro na piscina"*

**Fluxo de diálogo:**
1. Se o slot `quimico` não foi informado → Alexa pergunta: *"Qual produto: cloro, ácido ou base?"*
2. Alexa confirma: *"Você quer mesmo iniciar a dosagem de {quimico}?"*
3. Usuário responde "sim" ou "não".

---

### `DefinirModoIntent`

Define o modo de operação do sistema.

**Slot:** `modo` (tipo `MODO`, elicitação obrigatória)

**Frases de exemplo:**
- *"mude para modo automático"*
- *"ativar modo manual"*
- *"parada de emergência"*
- *"parar tudo"*

---

## Intents padrão da Amazon

| Intent | Comportamento |
|---|---|
| `AMAZON.HelpIntent` | Lista as ações disponíveis |
| `AMAZON.CancelIntent` | Encerra a sessão |
| `AMAZON.StopIntent` | Encerra a sessão |
| `AMAZON.FallbackIntent` | Orienta o usuário em caso de não-entendimento |
| `AMAZON.NavigateHomeIntent` | Retorno ao home do dispositivo |

---

## Tipos de slot

### `PARAMETRO`

| Id | Valor | Sinônimos |
|---|---|---|
| `ph` | pH | ph, potencial hidrogeniônico, acidez, ph da água |
| `cloro` | cloro | cloro livre, cloração, nível de cloro |
| `alcalinidade` | alcalinidade | alcalino, alcalinidade total |
| `orp` | ORP | oxirredução, potencial de oxirredução, redox |
| `umidade` | umidade | umidade do ar, umidade relativa |

### `LOCAL_TEMP`

| Id | Valor | Sinônimos |
|---|---|---|
| `piscina` | piscina | água, água da piscina, da piscina |
| `coletor` | coletor | coletor solar, solar, placa solar, do coletor |

### `QUIMICO`

| Id | Valor | Sinônimos |
|---|---|---|
| `cloro` | cloro | cloração, hipoclorito |
| `acido` | ácido | acido, ácido muriático, redutor de ph |
| `base` | base | barrilha, elevador de ph, soda |

### `MODO`

| Id | Valor | Sinônimos |
|---|---|---|
| `automatico` | automático | automatico, auto, autônomo |
| `manual` | manual | manualmente |
| `parada` | parada | parada de emergência, emergência, parar, parado, estop, desligar tudo |

---

## Modelo de diálogo

### `DosarIntent`

| Configuração | Valor |
|---|---|
| `confirmationRequired` | `true` |
| Prompt de confirmação | *"Você quer mesmo iniciar a dosagem de {quimico}?"* |
| Slot `quimico` — `elicitationRequired` | `true` |
| Prompt de elicitação | *"Qual produto: cloro, ácido ou base?"* |

### `DefinirModoIntent`

| Configuração | Valor |
|---|---|
| `confirmationRequired` | `false` |
| Slot `modo` — `elicitationRequired` | `true` |
| Prompt de elicitação | *"Qual modo: automático, manual ou parada de emergência?"* |
