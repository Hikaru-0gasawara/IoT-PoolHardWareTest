# AquaSense IoT — Pool Hardware Test

Firmware para monitoramento de qualidade de água em piscinas, desenvolvido para **ESP32**.
Mede pH, ORP, condutividade e temperaturas (piscina + coletor solar), controla a bomba de
circulação solar por histerese, exibe os dados em um LCD I2C e publica tudo via **MQTT**
para o **HiveMQ Cloud**. No protótipo, os sensores são substituídos por LEDs e por leituras
simuladas, permitindo validar todo o hardware e a lógica de controle.

**IBMEC São Paulo / Invivio Tecnologia Ltda**
Sistemas Embarcados — Prof. Marcel Stefan Wagner, PhD
Grupo 1: Okaru, João Perestrelo, Roan

---

## Sumário

- [Visão geral](#visão-geral)
- [Hardware e pinagem](#hardware-e-pinagem)
- [Parâmetros monitorados](#parâmetros-monitorados)
- [Lógica de controle da bomba](#lógica-de-controle-da-bomba)
- [Display LCD](#display-lcd)
- [Comunicação MQTT (HiveMQ)](#comunicação-mqtt-hivemq)
- [Configuração](#configuração)
- [Bibliotecas necessárias](#bibliotecas-necessárias)
- [Como compilar e gravar](#como-compilar-e-gravar)
- [Comportamento no boot](#comportamento-no-boot)
- [Troubleshooting](#troubleshooting)
- [Nota de segurança (TLS)](#nota-de-segurança-tls)
- [Estrutura do repositório](#estrutura-do-repositório)

---

## Visão geral

A cada **5 segundos** o firmware:

1. Lê pH, ORP, condutividade e as temperaturas da piscina e do coletor solar.
2. Acende os LEDs de alerta para cada parâmetro fora da faixa ideal.
3. Aplica a histerese de temperatura para ligar/desligar a bomba de circulação.
4. Atualiza o LCD (alternando entre duas telas).
5. Publica todas as leituras nos tópicos MQTT.

Wi-Fi e MQTT são **não-bloqueantes**: se a rede ou o broker caírem, o sistema continua
operando localmente (LEDs, LCD e bomba) e tenta reconectar em segundo plano.

---

## Hardware e pinagem

| Componente | Pino | Função |
|---|---|---|
| ESP32 (DevKit) | — | Microcontrolador principal |
| LED pH | **D4** | Acende quando pH fora de 7.2–7.6 |
| LED Wi-Fi | **D5** | Aceso = Wi-Fi conectado |
| LED ORP | **D18** | Acende quando ORP fora de 650–750 mV |
| LED Condutividade | **D19** | Acende quando EC fora de 800–1500 µS/cm |
| Relé da bomba | **D26** | Controle da bomba do coletor solar (ativo em **LOW**) |
| LCD I2C — SDA | **D21** | Barramento I2C de dados |
| LCD I2C — SCL | **D22** | Barramento I2C de clock |

> O relé é **ativo em nível baixo** (`RELE_ACTIVE_LOW = 1`). Se o seu módulo de relé for
> ativo em nível alto, troque para `#define RELE_ACTIVE_LOW 0` no início do código.

> ⚠️ **Alimentação do LCD:** use **5 V** (não 3,3 V) e garanta que o **GND do LCD esteja
> ligado ao GND do ESP32**. Sem GND comum, os sinais I2C não chegam e o display fica em branco.

---

## Parâmetros monitorados

| Parâmetro | Faixa ideal | Constantes no código |
|---|---|---|
| pH | 7.2 – 7.6 | `PH_MIN`, `PH_MAX` |
| ORP (oxirredução) | 650 – 750 mV | `ORP_MIN`, `ORP_MAX` |
| Condutividade (EC) | 800 – 1500 µS/cm | `COND_MIN`, `COND_MAX` |
| Temperatura piscina | — | referência para a bomba |
| Temperatura coletor | — | referência para a bomba |

---

## Lógica de controle da bomba

A bomba do coletor solar é controlada pela diferença de temperatura `ΔT = T_coletor − T_piscina`,
com **histerese** e proteção **anti-cycling**:

```
ΔT ≥ 5 °C   →  LIGA  a bomba
ΔT ≤ 1 °C   →  DESLIGA a bomba
Intervalo mínimo entre mudanças: 60 s (anti-cycling)
```

A primeira mudança de estado após o boot é liberada imediatamente (`primeiroCiclo`), sem
esperar os 60 s. Leituras de temperatura inválidas não disparam a bomba.

---

## Display LCD

O endereço I2C é **detectado automaticamente** (tenta `0x27`, `0x3F`, `0x20`, `0x38`, `0x26`,
`0x3E` e, se nenhum responder, faz uma varredura completa do barramento). Se nenhum display
for encontrado, o sistema continua funcionando normalmente sem ele (`lcdOK = false`).

O LCD alterna entre duas telas a cada ciclo, reescrevendo as linhas com padding (sem `clear()`,
para evitar flicker):

**Tela 1 — Química da água**
```
pH7.40 ORP700
EC1100 B:ON
```

**Tela 2 — Temperaturas**
```
Tp:24.0°C
Ts:28.0°C ON
```

---

## Comunicação MQTT (HiveMQ)

Conexão **MQTT sobre TLS** na porta **8883**. O `clientId` é único por dispositivo (derivado
dos 48 bits do MAC do ESP32). A reconexão é não-bloqueante (tenta a cada 5 s) e usa **LWT**
(Last Will & Testament): se o ESP32 cair, o broker publica `offline` automaticamente.

| Tópico | Conteúdo | Retain |
|---|---|---|
| `aquasense/agua/ph` | pH (float, 2 casas) | — |
| `aquasense/agua/orp` | ORP em mV (float) | — |
| `aquasense/agua/condutividade` | EC em µS/cm (float) | — |
| `aquasense/temperatura/piscina` | Temperatura da piscina em °C | — |
| `aquasense/temperatura/coletor` | Temperatura do coletor em °C | — |
| `aquasense/bomba/estado` | `ON` / `OFF` | ✓ |
| `aquasense/sistema/status` | `online` / `offline` (LWT) | ✓ |

Parâmetros do cliente: buffer **512 B**, keepalive **30 s**, socket timeout **10 s**.

### Testando pela web (HiveMQ)

1. No painel do seu cluster HiveMQ Cloud, abra o **Web Client**.
2. Conecte com o host, usuário e senha do cluster (WebSocket TLS — porta **8884**).
3. Faça *subscribe* em `aquasense/#` para ver todas as leituras chegando em tempo real.

---

## Configuração

Edite **apenas** estas linhas no início de `AquaSense.ino`:

```cpp
// Wi-Fi
const char* WIFI_SSID = "SUA_REDE_WIFI";
const char* WIFI_PASS = "SUA_SENHA_WIFI";

// HiveMQ Cloud
const char* MQTT_HOST = "xxxxxxxxxxxx.s1.eu.hivemq.cloud";  // host do seu cluster
const char* MQTT_USER = "seu_usuario_hivemq";
const char* MQTT_PASS = "sua_senha_hivemq";
```

O MQTT só é habilitado quando **todas** estas condições são verdadeiras:

- `MQTT_HOST` preenchido **e diferente** do placeholder `xxxxxxxxxxxx.s1.eu.hivemq.cloud`
- `MQTT_USER` preenchido
- `MQTT_PASS` preenchido

Se qualquer uma faltar, o firmware roda **offline** (LEDs, LCD e bomba continuam funcionando)
e registra `[MQTT] desabilitado` no Serial — útil para testar o hardware sem nuvem.

---

## Bibliotecas necessárias

Instale via **Arduino IDE → Tools → Manage Libraries**:

| Biblioteca | Autor | Observação |
|---|---|---|
| `PubSubClient` | Nick O'Leary | Cliente MQTT |
| `LiquidCrystal_I2C` | Marco Schwartz / Frank de Brabander | Precisa expor `init()` e `backlight()` |
| `WiFi`, `WiFiClientSecure`, `Wire` | Espressif | Já incluídas no core do ESP32 |

---

## Como compilar e gravar

1. **Boards Manager:** instale o pacote `esp32` (by Espressif Systems).
2. **Placa:** selecione *ESP32 Dev Module* (ou a sua variante) em **Tools → Board**.
3. **Bibliotecas:** instale `PubSubClient` e `LiquidCrystal_I2C`.
4. **Pasta do sketch:** o Arduino IDE exige que `AquaSense.ino` esteja dentro de uma pasta
   chamada `AquaSense/`. Ao abrir o arquivo da raiz do repositório, o IDE oferece criar essa
   pasta automaticamente — aceite. (Alternativa: copie o `.ino` para `AquaSense/AquaSense.ino`.)
5. **Credenciais:** preencha Wi-Fi e HiveMQ (seção [Configuração](#configuração)).
6. **Upload:** conecte o ESP32 via USB, selecione a porta e clique em *Upload*.
7. Abra o **Serial Monitor** a **115200 baud** para acompanhar o boot e as leituras.

---

## Comportamento no boot

```
=== AquaSense IoT - boot v2.1 ===
[LCD] endereco 0x27
... (teste dos 3 LEDs piscando) ...
[WiFi] Conectando... OK  IP=192.168.0.42  RSSI=-58 dBm
[MQTT] clientId=aquasense-XXXXXXXXXXXX
[MQTT] conectando... OK
```

Durante a operação, cada ciclo imprime uma linha de diagnóstico:

```
pH=7.40 ORP=700 EC=1100 Tp=24.0 Ts=28.0 dT=4.0 B=OFF LCD=OK WiFi=OK MQTT=OK
```

---

## Troubleshooting

| Sintoma | Causa provável | Solução |
|---|---|---|
| LCD em branco / só blocos | Sem GND comum, ou alimentado em 3,3 V | Use 5 V e ligue o GND do LCD ao GND do ESP32 |
| `[LCD] FALHOU` no Serial | Endereço I2C diferente ou fiação errada | Confira SDA=D21 / SCL=D22; veja o endereço impresso na varredura |
| `[WiFi] FALHOU` | SSID/senha errados, ou rede 5 GHz | ESP32 usa 2,4 GHz; confira credenciais |
| MQTT `rc=4` | Credenciais inválidas | Verifique `MQTT_USER` / `MQTT_PASS` do cluster |
| MQTT `rc=5` | Não autorizado | Cheque as permissões do usuário no HiveMQ |
| MQTT `rc=-2` | Falha de conexão / TLS | Confira `MQTT_HOST` e a porta 8883 |
| MQTT `rc=-4` | Timeout | Sinal Wi-Fi fraco ou broker indisponível |
| Bomba não liga | `ΔT < 5 °C` ou anti-cycling ativo | Aguarde ΔT ≥ 5 °C e o intervalo de 60 s |
| `[MQTT] desabilitado` | Credenciais não preenchidas | Preencha host/usuário/senha (seção Configuração) |

Códigos `rc` são o retorno de `PubSubClient::state()`.

---

## Nota de segurança (TLS)

Esta versão usa `wifiClient.setInsecure()` — a conexão é **criptografada**, mas o certificado
do servidor **não é validado**. Isso é adequado para **protótipo, testes e uso acadêmico**.

Para um deploy de produção real, substitua por validação de certificado:

```cpp
wifiClient.setCACert(ISRG_ROOT_X1);   // certificado raiz do HiveMQ Cloud
```

(O HiveMQ Cloud usa cadeia Let's Encrypt — raiz **ISRG Root X1**.)

---

## Estrutura do repositório

```
AquaSense.ino     ← firmware PRINCIPAL (ESP32 / Arduino C++)  ◀── este é o código de produção
README.md         ← esta documentação
.gitignore
wokwi/
  main.py         ← versão EXPERIMENTAL em MicroPython (Wokwi)
```

> **`AquaSense.ino` é o firmware principal e oficial do projeto.**
> A pasta `wokwi/` contém uma versão experimental em MicroPython (simulação no Wokwi, com
> broker público `broker.hivemq.com`, dosagem química autônoma e integração com Alexa) — usada
> apenas para experimentos e **não** é a base de produção.
