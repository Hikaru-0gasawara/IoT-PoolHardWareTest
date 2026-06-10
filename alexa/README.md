# AquaSense IoT — Skill Alexa (pt-BR)

Skill **customizada** da Alexa que conversa com o ESP32 do AquaSense pelo **mesmo broker MQTT**
do firmware e do dashboard. Permite **consultar** a telemetria da piscina por voz e **enviar
comandos** de dosagem e de modo.

> **Não exige mudança no firmware.** A skill lê o tópico retido `aquasense-ibmec-pt/dados` e
> publica em `aquasense-ibmec-pt/dosagem/comando` e `aquasense-ibmec-pt/controle/modo` — tópicos
> que o `AquaSense.ino` (v3.0+) já trata.

---

## O que dá para falar

| Você diz… | A skill faz |
|---|---|
| "qual o pH" / "qual o cloro" / "qual a alcalinidade" | Lê o snapshot e responde o valor + se está na faixa ideal |
| "qual a temperatura da piscina" / "do coletor" | Responde a temperatura (e o ΔT, se não especificar local) |
| "como está a água" / "resumo" | pH, cloro, alcalinidade, temperatura, bomba e alertas |
| "a bomba está ligada?" | Estado da bomba do coletor + ΔT |
| "dosar cloro" / "adicione ácido" / "dose base" | **Confirma** e publica `dosagem/comando` |
| "modo automático" / "manual" / "parada de emergência" | Publica `controle/modo` |

Invocação: **"monitor da piscina"**.
Exemplos: *"Alexa, abrir monitor da piscina"* · *"Alexa, pergunte ao monitor da piscina qual o pH"*.

---

## Arquitetura

```
Você ──voz──► Alexa ──► Skill (Lambda Alexa-hosted, Node.js)
                                   │
                                   ├─ lê  aquasense-ibmec-pt/dados      (retido)
                                   └─ publica  .../dosagem/comando
                                               .../controle/modo
                                   │
                                   ▼
                          Broker MQTT (broker.hivemq.com) ◄──► ESP32 (firmware)
```

A cada invocação, a Lambda abre uma conexão MQTT efêmera (WSS), faz **uma** operação e fecha.
Ler `dados` é rápido porque o firmware publica com `retain=true` — o broker entrega o último
valor logo após o subscribe.

---

## Estrutura

```
alexa/
  README.md
  skill-package/
    skill.json                                  ← manifesto da skill
    interactionModels/custom/pt-BR.json         ← intents, slots e diálogo (pt-BR)
  lambda/
    index.js                                    ← handlers da skill (ask-sdk-core)
    mqtt-bridge.js                              ← ponte MQTT (ler snapshot / publicar)
    config.js                                   ← broker, namespace e credenciais (env vars)
    package.json                                ← dependências (ask-sdk-core, mqtt)
```

---

## Deploy — Alexa-hosted (recomendado)

Não precisa de conta AWS; a Amazon provisiona a Lambda gratuitamente.

1. Acesse o **[Alexa Developer Console](https://developer.amazon.com/alexa/console/ask)** e clique
   em **Create Skill**.
2. **Skill name:** `Monitor da Piscina AquaSense` · **Locale primário:** `Português (BR)`.
3. **Model:** `Custom` · **Hosting:** **Alexa-hosted (Node.js)**. Clique em **Create skill**
   (escolha o template "Start from Scratch").
4. **Modelo de interação:**
   - Aba **Build → JSON Editor**, cole o conteúdo de
     `skill-package/interactionModels/custom/pt-BR.json` e **Save Model → Build Model**.
5. **Código da Lambda:**
   - Aba **Code**. Substitua o `index.js` pelo de `lambda/index.js` e crie os arquivos
     `mqtt-bridge.js` e `config.js` com o conteúdo desta pasta.
   - Abra o `package.json` e garanta as dependências de `lambda/package.json`
     (`ask-sdk-core` e `mqtt`). O Alexa-hosted roda `npm install` ao salvar/deploy.
   - Clique em **Save** e **Deploy**.
6. **Teste:** aba **Test**, mude para **Development** e fale/escreva
   *"abrir monitor da piscina"* e depois *"qual o pH"*.

> 💡 Alternativa rápida: como a estrutura aqui já segue o layout `skill-package/` + `lambda/`,
> dá para conectar o repositório git da skill ao Alexa-hosted e deixar o console sincronizar.

---

## Deploy — AWS Lambda própria (ASK CLI)

Se preferir hospedar na sua conta AWS:

```bash
npm i -g ask-cli
ask configure
cd alexa
# Empacote e publique a Lambda apontando o endpoint em skill-package/skill.json
ask deploy
```

Adicione em `skill.json → manifest.apis.custom.endpoint` o ARN da sua função:

```json
"endpoint": { "uri": "arn:aws:lambda:us-east-1:XXXXXXXXXXXX:function:aquasense-alexa" }
```

---

## Configuração do broker

Por padrão a skill usa o **mesmo cluster HiveMQ Cloud (TLS)** do firmware com `USAR_TLS 1`
(o padrão de `AquaSense.ino`) e o namespace `aquasense-ibmec-pt` — casa com o firmware e o
dashboard sem configuração adicional.

Para apontar para **outro broker** (ex.: o broker público `broker.hivemq.com`, usado quando o
firmware está em `USAR_TLS 0`, ou um cluster HiveMQ Cloud próprio), defina variáveis de ambiente
na Lambda (`config.js` as lê automaticamente):

| Variável | Exemplo | Quando usar |
|---|---|---|
| `MQTT_URL` | `wss://SEU_CLUSTER.s1.eu.hivemq.cloud:8884/mqtt` | Outro cluster HiveMQ Cloud |
| `MQTT_URL` | `wss://broker.hivemq.com:8884/mqtt` | Broker público (firmware em `USAR_TLS 0`) |
| `MQTT_USERNAME` | `usuario` | Cluster com autenticação (vazio/omitido no broker público) |
| `MQTT_PASSWORD` | `••••••••` | Cluster com autenticação (vazio/omitido no broker público) |
| `MQTT_NAMESPACE` | `aquasense-ibmec-pt` | Se mudar o namespace do firmware |
| `MQTT_TIMEOUT_MS` | `4500` | Ajuste fino (dentro dos 8 s da Alexa) |

> No Alexa-hosted, variáveis de ambiente não ficam expostas na UI; para credenciais sensíveis
> prefira a Lambda própria (ASK CLI) ou edite os defaults em `config.js`.

---

## Segurança das ações

- **Dosagem** exige **confirmação por voz** ("Você quer mesmo iniciar a dosagem de cloro?") antes
  de publicar o comando — definido no modelo de diálogo (`confirmationRequired`).
- **Mudança de modo** (`DefinirModoIntent`) também exige **confirmação por voz** ("Você quer mesmo
  mudar o modo para parada?") — inclui o caso crítico de **parada de emergência**, evitando que um
  trecho de fala mal interpretado pelo ASR pare o sistema sem intenção do usuário.
- O firmware ainda aplica suas próprias travas: se estiver em **parada de emergência** ou já
  houver uma **dose em andamento**, o comando é **bloqueado** e o evento sai em `dosagem/evento`.
- A skill não recebe o resultado de forma síncrona; ela confirma o **envio** e orienta a
  acompanhar pelo painel.

---

## Limitações conhecidas

- Cada invocação abre e fecha uma conexão MQTT (latência de ~1–2 s). É o esperado para skills
  sem backend persistente.
- Sem o ESP32 online (nada retido em `dados`), as consultas respondem que não há conexão.
- A skill é de **uso pessoal/acadêmico** (não publicada). Para publicar na loja, ajuste textos,
  ícones e política de privacidade no `skill.json`.
