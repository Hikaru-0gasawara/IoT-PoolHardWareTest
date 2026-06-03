# config.js — Configuração da Ponte MQTT

Módulo de configuração da skill Alexa. Todos os valores são lidos de **variáveis de ambiente** e têm defaults que apontam para o broker público usado pelo firmware e pelo dashboard, sem necessidade de configuração adicional para testes.

---

## Parâmetros

| Variável de ambiente | Default | Descrição |
|---|---|---|
| `MQTT_URL` | `wss://broker.hivemq.com:8884/mqtt` | URL do broker (WSS) |
| `MQTT_USERNAME` | `undefined` | Usuário (apenas para brokers autenticados) |
| `MQTT_PASSWORD` | `undefined` | Senha |
| `MQTT_NAMESPACE` | `aquasense-ibmec-pt` | Namespace MQTT — deve coincidir com o firmware e o dashboard |
| `MQTT_TIMEOUT_MS` | `4500` | Timeout de cada operação MQTT (ms) |

---

## Alinhamento com os outros componentes

O namespace e o broker devem ser **iguais** nos três componentes:

| Componente | Arquivo | Parâmetro |
|---|---|---|
| Firmware ESP32 | `AquaSense.ino` | `#define NS "aquasense-ibmec-pt"` |
| Dashboard React | `src/lib/mqttTopics.ts` | `NAMESPACE` |
| Skill Alexa | `config.js` | `NAMESPACE` (env `MQTT_NAMESPACE`) |

| Componente | Arquivo | URL do broker |
|---|---|---|
| Dashboard React | `src/providers/MqttProvider.tsx` | `wss://broker.hivemq.com:8884/mqtt` |
| Skill Alexa | `config.js` | `wss://broker.hivemq.com:8884/mqtt` (default) |
| Firmware (sem TLS) | `AquaSense.ino` | `broker.hivemq.com:1883` (TCP) |

---

## Configuração para HiveMQ Cloud

Para usar um cluster HiveMQ Cloud com TLS, defina as variáveis de ambiente na Lambda (Alexa-hosted: aba **Code → Environment variables**; Lambda própria: console AWS):

```
MQTT_URL       = wss://SEU_CLUSTER.s1.eu.hivemq.cloud:8884/mqtt
MQTT_USERNAME  = usuario
MQTT_PASSWORD  = senha
```

E no firmware, mude:

```cpp
#define USAR_TLS 1
const char* MQTT_HOST = "SEU_CLUSTER.s1.eu.hivemq.cloud";
const char* MQTT_USER = "usuario";
const char* MQTT_PASS = "senha";
```

---

## Timeout

`TIMEOUT_MS` (padrão 4500 ms) é o limite para cada operação MQTT individual. O valor foi escolhido para caber dentro do prazo de 8 s que a Alexa concede à Lambda, deixando margem para a execução do handler.

> Se o ESP32 estiver offline, `lerSnapshot` rejeita após esse timeout e a skill responde com a mensagem de erro de conexão.
