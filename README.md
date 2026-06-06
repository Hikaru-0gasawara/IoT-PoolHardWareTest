# AquaSense IoT — Pool Hardware Test

Sistema de monitoramento de qualidade de água em piscinas com coletor solar, desenvolvido para
**ESP32**. O firmware mede pH, cloro, alcalinidade, ORP, umidade e as temperaturas da piscina e
do coletor solar, aciona a **bomba do coletor** por diferença de temperatura (ΔT), exibe os dados
em um LCD I2C e publica tudo via **MQTT** no namespace `aquasense-ibmec-pt`. Um **dashboard web**
em React (pasta `dashboard-app/`) consome esses dados em tempo real via WebSocket.

No protótipo, os sensores são substituídos por LEDs e leituras simuladas, permitindo validar todo
o hardware, o protocolo MQTT e a lógica de controle ponta a ponta com o dashboard.

**IBMEC São Paulo / Invivio Tecnologia Ltda**
Sistemas Embarcados — Prof. Marcel Stefan Wagner, PhD
Grupo 1 (controle de aquecimento) · Grupo 2 (qualidade da água): João Perestrelo, Hikaru, Roan

---

## Sumário

- [Arquitetura](#arquitetura)
- [Hardware e pinagem](#hardware-e-pinagem)
- [Parâmetros monitorados](#parâmetros-monitorados)
- [Lógica de acionamento da bomba](#lógica-de-acionamento-da-bomba)
- [LEDs](#leds)
- [Display LCD](#display-lcd)
- [Protocolo MQTT (namespace PT)](#protocolo-mqtt-namespace-pt)
- [Dashboard web (dashboard-app)](#dashboard-web-dashboard-app)
- [Configuração](#configuração)
- [Bibliotecas necessárias](#bibliotecas-necessárias)
- [Como compilar e gravar](#como-compilar-e-gravar)
- [Utilitários de manutenção do ESP32](#utilitários-de-manutenção-do-esp32)
- [Troubleshooting](#troubleshooting)
- [Estrutura do repositório](#estrutura-do-repositório)

---

## Arquitetura

```
┌──────────┐   TCP 1883 (ou TLS 8883)   ┌─────────────────┐   WSS 8884   ┌───────────────┐
│  ESP32   │ ─────────────────────────► │  Broker HiveMQ  │ ◄─────────── │  dashboard-app │
│ firmware │     aquasense-ibmec-pt/*   │ (público/cloud) │   (browser)  │   (React/TS)   │
└──────────┘                            └─────────────────┘              └───────────────┘
```

- O **ESP32** lê os sensores a cada **5 s** e publica o tópico consolidado
  `aquasense-ibmec-pt/dados` (JSON flat) — a **fonte de verdade** do dashboard — além de tópicos
  granulares, saúde do sistema (60 s) e o estado de controle.
- O **dashboard** assina `aquasense-ibmec-pt/#`, valida o payload com Zod e renderiza tudo. Se o
  broker ficar **> 15 s** sem mensagem, ele entra em **simulação local** com um banner discreto e
  volta sozinho aos dados reais quando o ESP32 reaparece.
- O dashboard também **envia comandos**: `controle/modo` e `dosagem/comando`. O firmware os
  processa e responde com `dosagem/evento` e `controle/estado`.

> **Broker:** o dashboard conecta em `broker.hivemq.com:8884` (WSS). Para os dois conversarem, o
> ESP32 precisa estar no **mesmo broker**. Por isso o firmware vem com `USAR_TLS 0`
> (`broker.hivemq.com:1883`, público) por padrão.

---

## Hardware e pinagem

| Componente | Pino | Função |
|---|---|---|
| ESP32 (DevKit) | — | Microcontrolador principal |
| LED pH | **D4** | Aceso = pH fora da faixa |
| LED Wi-Fi | **D5** | Aceso = Wi-Fi conectado |
| LED Cloro | **D18** | Aceso = cloro fora da faixa |
| LED Alcalinidade | **D19** | Aceso = alcalinidade fora da faixa |
| Relé (bomba) | **D26** | Bomba do coletor solar (ativo em **LOW**) |
| LCD I2C — SDA | **D21** | Barramento I2C de dados |
| LCD I2C — SCL | **D22** | Barramento I2C de clock |

> O relé é **ativo em nível baixo** (`RELE_ACTIVE_LOW = 1`). Se o seu módulo for ativo em nível
> alto, troque para `#define RELE_ACTIVE_LOW 0`.

> ⚠️ **Alimentação do LCD:** use **5 V** (não 3,3 V) e garanta **GND comum** com o ESP32. Sem GND
> comum, os sinais I2C não chegam e o display fica em branco.

---

## Parâmetros monitorados

Faixas ideais conforme **ABNT NBR 10818** (mesmas do dashboard, `src/lib/thresholds.ts`):

| Parâmetro | Faixa ideal | Constantes no código | Alerta/LED |
|---|---|---|---|
| pH | 7.2 – 7.6 | `PH_MIN`, `PH_MAX` | LED D4 + alerta |
| Cloro livre | 1.0 – 3.0 ppm | `CLORO_MIN`, `CLORO_MAX` | LED D18 + alerta |
| Alcalinidade | 80 – 120 ppm | `ALC_MIN`, `ALC_MAX` | LED D19 + alerta |
| ORP (oxirredução) | — | telemetria | publicado em `dados` |
| Temperatura piscina | — | telemetria | controla a bomba |
| Temperatura coletor | — | telemetria | controla a bomba |
| Umidade | — | telemetria | publicado em `dados` |

> Valor sentinela **`-99.0`** em qualquer campo numérico sinaliza **erro de sensor** — o dashboard
> mostra `ERRO` no card correspondente.

---

## Lógica de acionamento da bomba

A bomba do coletor solar é controlada por **diferença de temperatura (ΔT)**, com **anti-cycling**:

```
ΔT = T_coletor − T_piscina
ΔT ≥ 5 °C  →  LIGA a bomba
ΔT ≤ 1 °C  →  DESLIGA a bomba
Intervalo mínimo entre mudanças: 60 s (anti-cycling)
```

A primeira mudança após o boot é liberada imediatamente (`primeiroCiclo`). A química da água
(pH/cloro/alcalinidade) **não** aciona a bomba — ela apenas gera **alertas** e acende os LEDs.

---

## LEDs

Cada LED de sensor acende **apenas quando o parâmetro está fora da faixa ideal**:

- **D4 (pH)**, **D18 (cloro)**, **D19 (alcalinidade)** → acesos = fora da faixa.
- **D5 (Wi-Fi)** → aceso = conectado.

No boot, os três LEDs de sensor fazem um breve teste de piscadas em sequência.

---

## Display LCD

Endereço I2C **detectado automaticamente** (preferência: `0x27`, `0x3F`, `0x20`, `0x38`, `0x26`,
`0x3E`; senão, varredura completa). Sem display, o sistema segue funcionando (`lcdOK = false`).

O LCD alterna entre duas telas a cada ciclo, com padding (sem `clear()`, para evitar flicker):

**Tela 1 — Química** &nbsp;&nbsp;&nbsp; **Tela 2 — Temperaturas**
```
pH7.40 Cl2.0          Tp:28.0°C
Alc100 B:ON           Ts:30.0°C ON
```

---

## Protocolo MQTT (namespace PT)

Namespace: **`aquasense-ibmec-pt`** (idêntico a `dashboard-app/src/lib/mqttTopics.ts`). O `clientId`
é único por dispositivo (48 bits do MAC). Reconexão não-bloqueante (5 s) com **LWT**: se o ESP32
cair, o broker publica `offline` em `sistema/status`.

### Tópicos publicados pelo ESP32

| Tópico | Conteúdo | Retain |
|---|---|---|
| `aquasense-ibmec-pt/dados` | **JSON consolidado** (fonte de verdade do dashboard) | ✓ |
| `aquasense-ibmec-pt/piscina/ph` | pH (float) | ✓ |
| `aquasense-ibmec-pt/piscina/cloro` | Cloro em ppm | ✓ |
| `aquasense-ibmec-pt/piscina/alcalinidade` | Alcalinidade em ppm | ✓ |
| `aquasense-ibmec-pt/piscina/temperatura` | Temperatura da piscina em °C | ✓ |
| `aquasense-ibmec-pt/coletor/temperatura` | Temperatura do coletor em °C | ✓ |
| `aquasense-ibmec-pt/coletor/bomba` | `LIGADA` / `DESLIGADA` | ✓ |
| `aquasense-ibmec-pt/sistema/alertas` | Array JSON de alertas ativos | ✓ |
| `aquasense-ibmec-pt/sistema/status` | `online` / `offline` (LWT) | ✓ |
| `aquasense-ibmec-pt/sistema/saude` | Telemetria técnica (uptime, heap, RSSI) a cada 60 s | ✓ |
| `aquasense-ibmec-pt/controle/estado` | `{ modo, parada_emergencia, dose_em_andamento }` | ✓ |
| `aquasense-ibmec-pt/dosagem/evento` | `iniciada` / `concluida` / `bloqueada` | — |

### Tópicos recebidos do dashboard

| Tópico | Payload | Ação no firmware |
|---|---|---|
| `aquasense-ibmec-pt/controle/modo` | `{"modo":"automatico\|manual\|parada"}` | Atualiza modo; `parada` ativa E-Stop |
| `aquasense-ibmec-pt/dosagem/comando` | `{"parametro":"cloro\|acido\|base"}` | Dispara dosagem simulada (8 s) ou bloqueia |

### Schema do payload consolidado `dados`

```json
{
  "projeto": "AquaSense IoT",
  "ciclo": 42,
  "ph": 7.40,
  "orp_mv": 700.0,
  "cloro": 2.00,
  "alcalinidade": 100.0,
  "temp_piscina": 28.0,
  "temp_coletor": 30.0,
  "delta_t": 2.0,
  "umidade": 65.0,
  "bomba": "LIGADA",
  "alertas": [],
  "modo": "automatico",
  "parada_emergencia": false,
  "dose_em_andamento": null
}
```

Parâmetros do cliente MQTT: buffer **768 B**, keepalive **30 s**, socket timeout **10 s**.

---

## Dashboard web (dashboard-app)

App **TanStack Start (React 19 + TypeScript + Vite)** em `dashboard-app/`, que consome a telemetria
do ESP32 via **MQTT sobre WebSocket Secure**.

```bash
cd dashboard-app
bun install      # ou: npm install
bun dev          # ou: npm run dev
```

Acesse `http://localhost:4173` (pare com `Ctrl + C`). O broker e o namespace ficam em
`dashboard-app/src/providers/MqttProvider.tsx` e `dashboard-app/src/lib/mqttTopics.ts`.

Os comandos acima são iguais em **Linux**, **macOS** e **Windows** — muda apenas como instalar o
Node.js/Bun:

| Sistema | Instalar pré-requisitos |
|---|---|
| **Linux** | `nvm install --lts` (Node) — ou `sudo apt install nodejs npm`. Bun (opcional): `curl -fsSL https://bun.sh/install \| bash` |
| **macOS** | `brew install node` (Node) · `brew install oven-sh/bun/bun` (Bun, opcional) |
| **Windows** | PowerShell: `winget install OpenJS.NodeJS.LTS` · Bun (opcional): `irm bun.sh/install.ps1 \| iex`. Rode no PowerShell/Prompt (WSL2 também funciona) |

> O projeto roda tanto com **Bun** quanto com **npm** — use o que tiver. Veja
> `dashboard-app/README.md` para o passo a passo detalhado por sistema.

> Há também um dashboard **single-file** sem build em `dashboard/index.html` (abre direto no
> browser, útil para teste rápido), porém ele usa o namespace antigo `aquasense-ibmec`. O
> `dashboard-app/` é o cliente oficial e alinhado ao firmware v3.0.

---

## Configuração

Edite **apenas** estas linhas no início de `AquaSense.ino`:

```cpp
#define USAR_TLS 0   // 0 = broker público (casa com o dashboard) | 1 = HiveMQ Cloud TLS 8883

// Wi-Fi
const char* WIFI_SSID = "SUA_REDE_WIFI";
const char* WIFI_PASS = "SUA_SENHA_WIFI";
```

- **`USAR_TLS 0`** (padrão): conecta em `broker.hivemq.com:1883` — o **mesmo broker** que o
  dashboard usa (`:8884` WSS). É a configuração que funciona out-of-the-box.
- **`USAR_TLS 1`**: conecta no seu cluster **HiveMQ Cloud** (TLS 8883) com usuário/senha. Neste
  caso, ajuste também o `MQTT_URL` do dashboard (`MqttProvider.tsx`) para o seu cluster.

> O ESP32 e o dashboard precisam falar com o **mesmo broker**. Sem TLS, use apenas em rede
> confiável / contexto acadêmico.

---

## Bibliotecas necessárias

Instale via **Arduino IDE → Tools → Manage Libraries**:

| Biblioteca | Autor | Observação |
|---|---|---|
| `PubSubClient` | Nick O'Leary | Cliente MQTT |
| `LiquidCrystal_I2C` | **Frank de Brabander** | Versão que usa `begin()` (sem argumentos) e `backlight()` |
| `WiFi`, `Wire` | Espressif | Já incluídas no core do ESP32 |

---

## Como compilar e gravar

1. **Boards Manager:** instale o pacote `esp32` (by Espressif Systems).
2. **Placa:** *ESP32 Dev Module* (ou sua variante) em **Tools → Board**.
3. **Bibliotecas:** instale `PubSubClient` e `LiquidCrystal_I2C` (Frank de Brabander).
4. **Pasta do sketch:** o Arduino IDE exige `AquaSense.ino` dentro de uma pasta `AquaSense/`.
   Ao abrir o arquivo da raiz, o IDE oferece criar essa pasta — aceite.
5. **Credenciais:** preencha Wi-Fi (e, se `USAR_TLS 1`, o host/credenciais do cluster).
6. **Upload:** conecte o ESP32 via USB, selecione a porta e clique em *Upload*.
7. Abra o **Serial Monitor** a **115200 baud**.

> Se o upload travar (`chip stopped responding`), reduza o **Upload Speed** para `115200`, troque
> o cabo USB (use um de dados) e ligue direto numa porta do PC (sem hub).

Durante a operação, cada ciclo imprime:

```
c=12 pH=7.40 Cl=2.00 Alc=100 ORP=700 Tp=28.0 Ts=30.0 dT=2.0 Um=65 B=OFF modo=automatico WiFi=OK MQTT=OK
```

---

## Utilitários de manutenção do ESP32

### BlinkLimpaMemoria.ino

Sketch minimalista em **`ferramentas/BlinkLimpaMemoria/`** (`ferramentas/BlinkLimpaMemoria/BlinkLimpaMemoria.ino`). Grava-o no ESP32 para
sobrescrever o firmware atual com um programa inerte: ele faz **um único blink** no LED onboard
(GPIO 2) e para para sempre.

**Quando usar:**

- Verificar que o ciclo de upload funciona antes de regravar o `AquaSense.ino`.
- Interromper um firmware em loop infinito sem precisar apagar a NVS/flash inteira.

> **Não apaga a NVS.** Para limpar dados persistidos e credenciais de Wi-Fi, use a opção
> **Erase Flash** da IDE/Arduino CLI ou `esptool.py erase_flash`.

---

## Troubleshooting

| Sintoma | Causa provável | Solução |
|---|---|---|
| Dashboard em "modo simulação local" | ESP32 não está publicando no broker do dashboard | Confira `USAR_TLS 0`, Wi-Fi e o `[MQTT] OK` no Serial |
| Dashboard não recebe nada | Namespace/broker divergentes | ESP32 e dashboard devem usar `aquasense-ibmec-pt` e o **mesmo** broker |
| Upload trava (`chip stopped responding`) | Cabo/porta USB instável | Upload Speed `115200`, cabo de dados, porta direta no PC |
| `no member named 'init'` | LiquidCrystal_I2C de outro autor | Use a de **Frank de Brabander** (usa `begin()`) |
| LCD em branco / só blocos | Sem GND comum, ou 3,3 V | Use 5 V e ligue o GND do LCD ao GND do ESP32 |
| `[WiFi] FALHOU` | SSID/senha errados, ou rede 5 GHz | ESP32 usa 2,4 GHz; confira credenciais |
| MQTT `rc=-2` | Broker inacessível | Confira `MQTT_HOST`/porta e se o broker está no ar |
| MQTT `rc=4` / `rc=5` | Credenciais inválidas (modo TLS) | Verifique `MQTT_USER`/`MQTT_PASS` no cluster |
| Bomba não muda | Anti-cycling ativo | Aguarde o intervalo de 60 s |

Códigos `rc` são o retorno de `PubSubClient::state()` (traduzidos no Serial por `mqttRcToStr`).

---

## Estrutura do repositório

```
AquaSense/
  AquaSense.ino                            ← firmware PRINCIPAL (ESP32 / Arduino C++) — protocolo PT v3.0
  README.md                                ← documentação do firmware (pinagem, protocolo, sensores)
README.md                                  ← esta documentação
dashboard-app/                             ← dashboard web oficial (TanStack Start / React + TS)
  src/                                     ← componentes, store, provider MQTT, tópicos
  package.json
  README.md                                ← stack, arquitetura, como rodar, testes
dashboard/
  index.html                               ← dashboard single-file (sem build, namespace antigo)
  README.md                                ← instruções e aviso de namespace
docs/
  Glossario.md                             ← glossário EN→PT de campos MQTT (fonte única)
  README.md
alexa/                                     ← skill Alexa pt-BR (consulta + comandos via MQTT)
  skill-package/                           ← manifesto + modelo de interação
  lambda/                                  ← handler Node.js (ask-sdk-core) + ponte MQTT
  README.md                                ← deploy, configuração, comandos de voz
ferramentas/
  BlinkLimpaMemoria/
    BlinkLimpaMemoria.ino                  ← utilitário: sobrescreve firmware com um blink inerte
  README.md
wokwi/
  main.py                                  ← versão EXPERIMENTAL em MicroPython (Wokwi)
  README.md
.github/
  workflows/ci.yml                         ← lint + vitest + build em cada push/PR
  README.md
```

> **`AquaSense.ino` é o firmware principal e oficial.** O `dashboard-app/` é o cliente web alinhado
> a ele (namespace `aquasense-ibmec-pt`, tópico consolidado `dados`). A pasta `wokwi/` contém uma
> versão experimental em MicroPython, usada apenas para simulação.
