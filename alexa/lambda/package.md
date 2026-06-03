# package.json — Dependências da Lambda Alexa

Manifesto npm do código da Lambda da skill **Monitor da Piscina AquaSense**.

---

## Dependências

| Pacote | Versão | Uso |
|---|---|---|
| `ask-sdk-core` | `^2.14.0` | SDK oficial da Alexa — builders, helpers de request/response, utilitários de slot |
| `mqtt` | `^5.10.1` | Cliente MQTT com suporte a WebSocket seguro (WSS) para comunicação com o broker |

> No **Alexa-hosted**, o console executa `npm install` automaticamente ao salvar ou fazer deploy. Não é necessário enviar a pasta `node_modules`.

---

## Runtime

```
node >= 18
```

O Alexa-hosted Node.js usa Node 18 LTS por padrão, compatível com `async/await` nativo e `mqtt` v5.

---

## Instalação local (para testes)

```bash
cd alexa/lambda
npm install
```

Após instalar, é possível testar os módulos localmente com:

```bash
node -e "const cfg = require('./config'); console.log(cfg);"
```

Para um teste de integração real, o broker precisa estar acessível e o ESP32 precisa estar publicando em `aquasense-ibmec-pt/dados`.
