# mqtt-bridge.js — Ponte MQTT da Skill Alexa

Módulo responsável pela comunicação MQTT entre a Lambda da skill Alexa e o broker. Cada invocação abre uma conexão **efêmera**: conecta, executa **uma** operação (ler ou publicar) e fecha.

---

## Por que conexão efêmera?

A Alexa impõe um limite de **8 segundos** para a Lambda responder. Manter uma conexão persistente entre invocações é inviável no modelo Alexa-hosted. A estratégia efêmera funciona bem porque:

- Leitura de `dados` é instantânea — o broker entrega o último payload retido logo após o `subscribe`.
- Publicação de comandos é fire-and-forget com `qos: 1`.

---

## API

### `lerSnapshot() → Promise<object>`

Conecta ao broker, assina `{NAMESPACE}/dados` e aguarda o payload retido. Resolve com o objeto JSON parseado. Rejeita se o timeout expirar ou ocorrer erro de conexão/parse.

**Timeout:** `cfg.TIMEOUT_MS` (padrão 4500 ms).

```javascript
const snap = await bridge.lerSnapshot();
console.log(snap.ph, snap.bomba);
```

### `publicar(subtopico, objeto) → Promise<void>`

Conecta ao broker e publica `JSON.stringify(objeto)` no tópico `{NAMESPACE}/{subtopico}` com `qos: 1`. Resolve quando a publicação é confirmada pelo broker. Rejeita em caso de timeout ou erro.

```javascript
await bridge.publicar("dosagem/comando", { parametro: "cloro" });
await bridge.publicar("controle/modo",   { modo: "parada" });
```

---

## Tópicos usados

| Operação | Tópico | QoS |
|---|---|---|
| `lerSnapshot` | `aquasense-ibmec-pt/dados` | 0 (subscribe) |
| `publicar("dosagem/comando", ...)` | `aquasense-ibmec-pt/dosagem/comando` | 1 |
| `publicar("controle/modo", ...)` | `aquasense-ibmec-pt/controle/modo` | 1 |

---

## Função interna `novaConexao()`

Cria um cliente MQTT com as opções:

| Opção | Valor |
|---|---|
| `connectTimeout` | `cfg.TIMEOUT_MS` |
| `reconnectPeriod` | `0` — sem auto-reconnect |
| `clean` | `true` — sessão limpa |
| `clientId` | `alexa-` + 8 hex aleatórios |
| `username` / `password` | Apenas se `cfg.MQTT_USERNAME` estiver definido |

---

## Tratamento de erros e timeout

Ambas as funções usam o mesmo padrão `encerrar(err, data)`:

1. Flag `resolvido` garante que o Promise seja resolvido/rejeitado **apenas uma vez**.
2. `clearTimeout(timer)` cancela o watchdog assim que a operação termina.
3. `client.end(true)` fecha a conexão de forma forçada e silenciosa.

---

## Configuração

O módulo lê todas as configurações de `./config`. Não há valores hardcoded além do comportamento `reconnectPeriod: 0`.

---

## Dependências

| Pacote | Uso |
|---|---|
| `mqtt` (v5) | Cliente MQTT com suporte a WSS |
| `./config` | URL do broker, namespace, credenciais, timeout |
