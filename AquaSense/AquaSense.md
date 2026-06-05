# AquaSense.ino — Firmware ESP32 v3.0

Firmware principal do projeto **AquaSense IoT** para ESP32. Monitora a qualidade da água da piscina, controla a bomba do coletor solar e se comunica bidiretamente com o dashboard React e a skill Alexa via MQTT.

---

## Protocolo

Namespace MQTT: `aquasense-ibmec-pt`

| Tópico | Direção | Descrição |
|---|---|---|
| `.../dados` | Publica (retain) | Payload consolidado JSON — fonte de verdade do dashboard |
| `.../piscina/ph` | Publica (retain) | pH isolado |
| `.../piscina/cloro` | Publica (retain) | Cloro livre (ppm) |
| `.../piscina/alcalinidade` | Publica (retain) | Alcalinidade total (ppm) |
| `.../piscina/temperatura` | Publica (retain) | Temperatura da água (°C) |
| `.../coletor/temperatura` | Publica (retain) | Temperatura do coletor solar (°C) |
| `.../coletor/bomba` | Publica (retain) | `LIGADA` ou `DESLIGADA` |
| `.../sistema/status` | Publica (retain) | LWT: `online` / `offline` |
| `.../sistema/saude` | Publica (60s) | Heap livre, RSSI, tempo ativo |
| `.../controle/estado` | Publica (retain) | Modo atual, parada de emergência, dose em andamento |
| `.../dosagem/evento` | Publica | Eventos de dosagem: iniciada / concluída / bloqueada |
| `.../controle/modo` | **Recebe** | Comando de modo: `automatico`, `manual`, `parada` |
| `.../dosagem/comando` | **Recebe** | Comando de dosagem: `cloro`, `acido`, `base` |

### Payload `.../dados` (a cada 5s, retain=true)

```json
{
  "projeto": "AquaSense IoT",
  "ciclo": 42,
  "ph": 7.40,
  "orp_mv": 700.0,
  "cloro": 2.00,
  "alcalinidade": 100.0,
  "temp_piscina": 28.0,
  "temp_coletor": 33.5,
  "delta_t": 5.5,
  "umidade": 65.0,
  "bomba": "LIGADA",
  "alertas": [],
  "modo": "automatico",
  "parada_emergencia": false,
  "dose_em_andamento": null
}
```

---

## Mapeamento de pinos

| Pino | Função |
|---|---|
| D4 | LED pH (acende quando pH fora da faixa) |
| D5 | LED Wi-Fi (acende quando conectado) |
| D18 | LED Cloro (acende quando cloro fora da faixa) |
| D19 | LED Alcalinidade (acende quando alcalinidade fora da faixa) |
| D21 | LCD SDA (I2C) |
| D22 | LCD SCL (I2C) |
| D26 | Relé da bomba do coletor solar |

---

## Faixas ideais (ABNT NBR 10818)

| Parâmetro | Mínimo | Máximo |
|---|---|---|
| pH | 7,2 | 7,6 |
| Cloro livre | 1,0 ppm | 3,0 ppm |
| Alcalinidade | 80 ppm | 120 ppm |

---

## Configuração

### Wi-Fi

```cpp
const char* WIFI_SSID = "SUA_REDE_WIFI";  // substituir
const char* WIFI_PASS = "SUA_SENHA_WIFI"; // substituir
```

> O ESP32 só conecta em redes **2,4 GHz**.

### Broker MQTT

```cpp
#define USAR_TLS 0  // 0 = broker público | 1 = HiveMQ Cloud TLS
```

| `USAR_TLS` | Broker | Porta | Autenticação |
|---|---|---|---|
| `0` | `broker.hivemq.com` | 1883 | Nenhuma |
| `1` | Cluster HiveMQ Cloud | 8883 | Usuário/senha |

Com `USAR_TLS 0` o ESP32 usa o **mesmo broker** do dashboard (`broker.hivemq.com:8884 WSS`) — nenhuma configuração adicional é necessária para os dois se comunicarem.

Com `USAR_TLS 1`, altere também `MQTT_URL` em `src/providers/MqttProvider.tsx` para o seu cluster.

---

## Controle da bomba

Lógica de histerese baseada no ΔT (temperatura do coletor − temperatura da piscina):

| Condição | Ação |
|---|---|
| ΔT ≥ 5 °C | Liga a bomba |
| ΔT ≤ 1 °C | Desliga a bomba |
| Mudança < 60 s atrás | Anti-cycling: ignora |

---

## Simulação de sensores

Os sensores são simulados com funções senoidas de período longo (nenhum hardware de sensor é necessário para testar):

| Sensor | Faixa simulada | Período |
|---|---|---|
| pH | 7,2 – 7,6 | 30 s |
| ORP | 640 – 760 mV | 25 s |
| Cloro | 1,1 – 2,9 ppm | 35 s |
| Alcalinidade | 82 – 118 ppm | 40 s |
| Temperatura piscina | 26 – 30 °C | 60 s |
| Temperatura coletor | 21 – 39 °C | 45 s |
| Umidade | 55 – 75 % | 50 s |

---

## Dosagem (simulada)

Quando o firmware recebe `dosagem/comando`:

1. Verifica parada de emergência — se ativa, publica `bloqueada`.
2. Verifica dose em andamento — se houver, publica `bloqueada`.
3. Caso contrário, inicia timer de **8 s**, publica `iniciada`.
4. Ao expirar o timer, publica `concluida` e limpa o estado.

---

## LCD I2C 16×2

O firmware detecta o endereço automaticamente no boot. Tenta primeiro os endereços comuns (`0x27`, `0x3F`, `0x20`, `0x38`, `0x26`, `0x3E`); se nenhum responder, faz um scan completo do barramento.

Alterna entre duas telas a cada ciclo de 5 s:

- **Tela A:** `pH7.40 Cl2.0` / `Alc100 B:ON`
- **Tela B:** `Tp:28.0°C` / `Ts:33.5°C ON`

---

## Dependências (Arduino IDE)

| Biblioteca | Origem |
|---|---|
| `PubSubClient` | Nick O'Leary (Library Manager) |
| `LiquidCrystal_I2C` | Frank de Brabander (Library Manager) |
| `WiFi` / `WiFiClientSecure` | Incluso no ESP32 Arduino core |

---

## Reconexão automática

| Evento | Comportamento |
|---|---|
| Wi-Fi cai | Tenta reconectar a cada 10 s |
| MQTT desconecta | Tenta reconectar a cada 5 s |
| Reconexão MQTT | Publica LWT `online`, re-subscribe, publica estado retido |
