# AquaSense IoT — Pool Hardware Test

Firmware de protótipo para monitoramento de qualidade de água em piscinas, desenvolvido para ESP32.  
Utiliza LEDs no lugar dos sensores reais para validação do hardware e da lógica de controle.

**IBMEC São Paulo / Invivio Tecnologia Ltda**  
Sistemas Embarcados — Prof. Marcel Stefan Wagner, PhD  
Grupo 1: Okaru, João Perestrelo, Roan

---

## Visão Geral

O AquaSense IoT monitora continuamente os parâmetros da água da piscina e do coletor solar, exibe os dados em um display LCD I2C e publica as leituras via MQTT no HiveMQ público ou no HiveMQ Cloud, selecionado por `USAR_TLS`. Quando os valores saem da faixa ideal, LEDs acendem como alerta. Uma bomba de circulação solar é controlada automaticamente por lógica de histerese com proteção anti-cycling.

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

## Comunicação MQTT (HiveMQ)

O firmware usa `#define USAR_TLS 1` por padrão para conectar ao cluster HiveMQ Cloud `5b98faa6560246759f3065ffc720f8b9.s1.eu.hivemq.cloud` na porta **8883**. As credenciais do Access Management usadas pelo sketch são `MQTT_USER="ProjetoIoT"` e a senha configurada no código. Para voltar ao broker público de teste, altere para `#define USAR_TLS 0`, que usa `broker.hivemq.com` na porta **1883**, sem TLS e sem login. Todos os tópicos publicam a cada 5 segundos. Reconexão Wi-Fi e MQTT são **não-bloqueantes** com backoff (não travam o loop principal).

> **Atenção:** com `USAR_TLS 0`, os dados vão para o broker público, não para o painel do seu cluster HiveMQ Cloud. Para confirmar publicação, assine os tópicos `aquasense-ibmec/#` em um cliente MQTT conectado ao mesmo broker/porta. A v2.4 publica as leituras com `retain=true` e imprime `[PUB] <topico> -> OK/FALHOU` no Serial Monitor.

| Tópico | Conteúdo | Retain |
|---|---|---|
| `aquasense-ibmec/agua/ph` | Valor de pH (float) | ✓ |
| `aquasense-ibmec/agua/orp` | Valor de ORP em mV (float) | ✓ |
| `aquasense-ibmec/agua/condutividade` | Condutividade em µS/cm (float) | ✓ |
| `aquasense-ibmec/temperatura/piscina` | Temperatura da piscina em °C (float) | ✓ |
| `aquasense-ibmec/temperatura/coletor` | Temperatura do coletor solar em °C (float) | ✓ |
| `aquasense-ibmec/bomba/estado` | Estado da bomba: `ON` ou `OFF` | ✓ |
| `aquasense-ibmec/sistema/status` | `online` / `offline` (LWT — Last Will and Testament) | ✓ |
| `aquasense-ibmec/alexa/snapshot` | Snapshot JSON das leituras e alertas | ✓ |
| `aquasense-ibmec/dosagem/comando` | Comando JSON de dosagem simulada | — |
| `aquasense-ibmec/alexa/resposta` | Resposta JSON do comando de dosagem | — |

---

## Configuração

Antes de compilar, edite as constantes no início do arquivo `AquaSense.ino`:

```cpp
#define USAR_TLS 1   // 0 = broker público sem TLS/login | 1 = HiveMQ Cloud TLS

// Wi-Fi
const char* WIFI_SSID = "SUA_REDE_WIFI";
const char* WIFI_PASS = "SUA_SENHA_WIFI";

#if USAR_TLS
  const char* MQTT_HOST = "5b98faa6560246759f3065ffc720f8b9.s1.eu.hivemq.cloud";
  const int   MQTT_PORT = 8883;
  const char* MQTT_USER = "ProjetoIoT";
  const char* MQTT_PASS = "IoT12345678";
#else
  const char* MQTT_HOST = "broker.hivemq.com";
  const int   MQTT_PORT = 1883;
  const char* MQTT_USER = "";
  const char* MQTT_PASS = "";
#endif
```

---

## Bibliotecas Necessárias

Instale via **Arduino IDE → Library Manager**:

| Biblioteca | Autor |
|---|---|
| `WiFi` | Nativa do ESP32 |
| `WiFiClient` / `WiFiClientSecure` | Nativas do ESP32 |
| `PubSubClient` | Nick O'Leary |
| `LiquidCrystal_I2C` | Frank de Brabander (versão com `lcd.begin()` sem argumentos) |

---

## Como Compilar e Gravar

1. Instale o suporte ao ESP32 no Arduino IDE via **Boards Manager** (`esp32` by Espressif)
2. Selecione a placa **ESP32 Dev Module**
3. Instale as bibliotecas listadas acima
4. Preencha as credenciais de Wi-Fi no código e confirme que `MQTT_USER`/`MQTT_PASS` correspondem ao Access Management do HiveMQ Cloud
5. Compile e grave via USB

---

## Simulação dos Sensores

Neste protótipo, os sensores físicos são substituídos por funções que geram valores oscilantes com `sinf(millis())`, permitindo testar toda a lógica de controle, LEDs, LCD e MQTT sem os sensores reais conectados.

---

## Otimizações da v2.4

- **Seleção entre HiveMQ público** (`broker.hivemq.com:1883`) **e HiveMQ Cloud TLS** (`USAR_TLS=1`)
- **Diagnóstico de publicação** com `[PUB] <tópico> -> OK/FALHOU` e tradução de códigos de erro MQTT/Wi-Fi no Serial Monitor
- **Leituras retidas (`retain=true`)** para facilitar validação em clientes que assinam depois da publicação
- **Reconexão Wi-Fi e MQTT 100% não-bloqueantes** com backoff (loop nunca trava)
- **Last Will and Testament (LWT)** — broker avisa quando o ESP32 cai
- **Uso de buffers fixos** — `snprintf` + arrays `char[]` no lugar de `String` para mensagens e LCD
- **clientId MQTT único** usando todos os 48 bits do MAC do ESP32
- **Auto-reconnect Wi-Fi** explicitamente habilitado
- **Detecção automática ampliada** do endereço I2C do LCD (0x27 / 0x3F / 0x20 / 0x38 / 0x26 / 0x3E, com varredura fallback)
- **LCD sem flicker** (padding em vez de `clear()`)

---

## Diagnóstico rápido quando “conecta mas não publica”

1. Abra o Serial Monitor em **115200 baud**.
2. Confirme o bloco de boot: `[MODO]`, `[BROKER]` e `[MQTT] habilitado`.
3. Se usar `USAR_TLS 0`, conecte seu cliente MQTT em `broker.hivemq.com:1883` e assine `aquasense-ibmec/#`. Não procure esses dados no painel do seu cluster Cloud.
4. Verifique as linhas `[PUB] ... -> OK`. Se aparecer `FALHOU`, confira o `rc` traduzido na linha de conexão MQTT.
5. Confirme que a rede Wi-Fi é **2.4 GHz**, pois ESP32 não conecta em rede somente 5 GHz.


---

## Sketch utilitário: BlinkLimpaMemoria

O repositório também inclui `BlinkLimpaMemoria.ino`, um sketch mínimo para sobrescrever temporariamente o firmware principal do ESP32. Ele faz **apenas um blink** no LED onboard e depois permanece parado no `loop()`.

Use esse sketch quando quiser confirmar que a gravação via USB está funcionando ou substituir rapidamente o firmware atual antes de gravar outra versão. Na maioria dos ESP32 DevKit, o LED onboard fica no GPIO 2; se a placa definir `LED_BUILTIN`, o sketch usa esse pino automaticamente.

> **Importante:** gravar `BlinkLimpaMemoria.ino` substitui o programa atual na flash, mas não apaga necessariamente toda a flash/NVS. Para apagar tudo, use **Erase Flash** na Arduino IDE/CLI ou `esptool.py erase_flash`.

Passos rápidos:

1. Abra `BlinkLimpaMemoria.ino` na Arduino IDE.
2. Selecione a mesma placa ESP32 e porta USB.
3. Compile e grave.
4. Confirme que o LED pisca uma única vez após o boot.
5. Depois, abra `AquaSense.ino` e grave novamente o firmware principal.
---

## Estrutura do Repositório

```
AquaSense.ino            ← firmware principal (ESP32 / Arduino)
BlinkLimpaMemoria.ino    ← sketch utilitário de um blink para sobrescrever/recuperar
README.md
```
