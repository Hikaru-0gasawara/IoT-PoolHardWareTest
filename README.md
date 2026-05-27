# AquaSense IoT — Pool Hardware Test

Firmware de protótipo para monitoramento de qualidade de água em piscinas, desenvolvido para ESP32.  
Utiliza LEDs no lugar dos sensores reais para validação do hardware e da lógica de controle.

**IBMEC São Paulo / Invivio Tecnologia Ltda**  
Sistemas Embarcados — Prof. Marcel Stefan Wagner, PhD  
Grupo 1: Okaru, João Perestrelo, Roan

---

## Visão Geral

O AquaSense IoT monitora continuamente os parâmetros da água da piscina e do coletor solar, exibe os dados em um display LCD I2C e publica as leituras via MQTT (TLS) para uma nuvem HiveMQ. Quando os valores saem da faixa ideal, LEDs acendem como alerta. Uma bomba de circulação solar é controlada automaticamente por lógica de histerese com proteção anti-cycling.

---

## Hardware

| Componente | Descrição |
|---|---|
| ESP32 | Microcontrolador principal |
| LCD I2C 16×2 | Display de leituras (autodetecta 0x27 / 0x3F) |
| LED 1 (D4) | Alerta de pH fora da faixa |
| LED Wi-Fi (D5) | Status da conexão Wi-Fi |
| LED 2 (D18) | Alerta de ORP fora da faixa |
| LED 3 (D19) | Alerta de condutividade fora da faixa |
| Relé (D26) | Controle da bomba do coletor solar |

### Mapeamento de Pinos

```
D4   → LED pH
D5   → LED Wi-Fi
D18  → LED ORP
D19  → LED Condutividade
D21  → LCD SDA (I2C)
D22  → LCD SCL (I2C)
D26  → Relé (bomba solar)
```

---

## Parâmetros Monitorados

| Parâmetro | Faixa Ideal |
|---|---|
| pH | 7.2 – 7.6 |
| ORP (potencial de oxirredução) | 650 – 750 mV |
| Condutividade (EC) | 800 – 1500 µS/cm |
| Temperatura piscina | — (referência para controle da bomba) |
| Temperatura coletor solar | — (referência para controle da bomba) |

---

## Lógica de Controle da Bomba Solar

A bomba é ativada quando a diferença de temperatura entre o coletor solar e a piscina (`ΔT`) atinge **5 °C**, e desligada quando cai para **1 °C** (histerese). Um temporizador de **60 segundos** impede ciclos rápidos de liga/desliga (anti-cycling).

```
ΔT ≥ 5 °C  →  LIGA bomba
ΔT ≤ 1 °C  →  DESLIGA bomba
Intervalo mínimo entre mudanças: 60 s
```

---

## Display LCD

O display alterna entre duas telas a cada ciclo de 5 segundos:

**Tela 1 — Qualidade da Água**
```
pH7.40 ORP700
EC1100 B: ON
```

**Tela 2 — Temperaturas**
```
Tp: 24.0°C
Ts: 28.0°C ON
```

---

## Comunicação MQTT (HiveMQ Cloud)

Conexão **TLS validada** na porta **8883**, usando o certificado raiz ISRG Root X1 (Let's Encrypt) embarcado no firmware. Todos os tópicos publicam a cada 5 segundos. Reconexão Wi-Fi e MQTT são **não-bloqueantes** com backoff (não travam o loop principal).

| Tópico | Conteúdo | Retain |
|---|---|---|
| `aquasense/agua/ph` | Valor de pH (float) | — |
| `aquasense/agua/orp` | Valor de ORP em mV (float) | — |
| `aquasense/agua/condutividade` | Condutividade em µS/cm (float) | — |
| `aquasense/temperatura/piscina` | Temperatura da piscina em °C (float) | — |
| `aquasense/temperatura/coletor` | Temperatura do coletor solar em °C (float) | — |
| `aquasense/bomba/estado` | Estado da bomba: `ON` ou `OFF` | ✓ |
| `aquasense/sistema/status` | `online` / `offline` (LWT — Last Will and Testament) | ✓ |

---

## Configuração

Antes de compilar, edite as constantes no início do arquivo `AquaSense.ino`:

```cpp
// Wi-Fi
const char* WIFI_SSID = "SUA_REDE_WIFI";
const char* WIFI_PASS = "SUA_SENHA_WIFI";

// HiveMQ Cloud
const char* MQTT_HOST = "xxxxxxxxxxxx.s1.eu.hivemq.cloud";
const char* MQTT_USER = "seu_usuario_hivemq";
const char* MQTT_PASS = "sua_senha_hivemq";
```

---

## Bibliotecas Necessárias

Instale via **Arduino IDE → Library Manager**:

| Biblioteca | Autor |
|---|---|
| `WiFi` | Nativa do ESP32 |
| `WiFiClientSecure` | Nativa do ESP32 |
| `PubSubClient` | Nick O'Leary |
| `LiquidCrystal_I2C` | Frank de Brabander (versão com `lcd.begin()` sem argumentos) |

---

## Como Compilar e Gravar

1. Instale o suporte ao ESP32 no Arduino IDE via **Boards Manager** (`esp32` by Espressif)
2. Selecione a placa **ESP32 Dev Module**
3. Instale as bibliotecas listadas acima
4. Preencha as credenciais de Wi-Fi e MQTT no código
5. Compile e grave via USB

---

## Simulação dos Sensores

Neste protótipo, os sensores físicos são substituídos por funções que geram valores oscilantes com `sinf(millis())`, permitindo testar toda a lógica de controle, LEDs, LCD e MQTT sem os sensores reais conectados.

---

## Otimizações da v2.0

- **TLS com validação de certificado** (ISRG Root X1) — sem `setInsecure()`
- **Reconexão Wi-Fi e MQTT 100% não-bloqueantes** com backoff (loop nunca trava)
- **Last Will and Testament (LWT)** — broker avisa quando o ESP32 cai
- **Sem heap dinâmico** — LCD estático, `snprintf` + `char[17]` no lugar de `String`
- **clientId MQTT único** usando todos os 48 bits do MAC do ESP32
- **Auto-reconnect Wi-Fi** explicitamente habilitado
- **Detecção automática** do endereço I2C do LCD (0x27 / 0x3F)
- **LCD sem flicker** (padding em vez de `clear()`)

---

## Estrutura do Repositório

```
AquaSense.ino   ← firmware principal (ESP32 / Arduino)
README.md
```
