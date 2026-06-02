# AquaSense IoT — Pool Hardware Test

Firmware para monitoramento de qualidade de água em piscinas, desenvolvido para **ESP32**.
Mede pH, ORP, condutividade e temperaturas (piscina + coletor solar), aciona um relé quando
a química da água sai da faixa ideal, exibe os dados em um LCD I2C e publica tudo via **MQTT**
para um **broker HiveMQ local**. No protótipo, os sensores são substituídos por LEDs e por
leituras simuladas, permitindo validar todo o hardware e a lógica de controle.

**IBMEC São Paulo / Invivio Tecnologia Ltda**
Sistemas Embarcados — Prof. Marcel Stefan Wagner, PhD
Grupo 1: Okaru, João Perestrelo, Roan

---

## Sumário

- [Visão geral](#visão-geral)
- [Hardware e pinagem](#hardware-e-pinagem)
- [Parâmetros monitorados](#parâmetros-monitorados)
- [Lógica de acionamento do relé](#lógica-de-acionamento-do-relé)
- [LEDs](#leds)
- [Display LCD](#display-lcd)
- [Comunicação MQTT (HiveMQ local)](#comunicação-mqtt-hivemq-local)
- [Configuração](#configuração)
- [Bibliotecas necessárias](#bibliotecas-necessárias)
- [Como compilar e gravar](#como-compilar-e-gravar)
- [Comportamento no boot](#comportamento-no-boot)
- [Utilitário: apagar memória](#utilitário-apagar-memória)
- [Troubleshooting](#troubleshooting)
- [Estrutura do repositório](#estrutura-do-repositório)

---

## Visão geral

A cada **5 segundos** o firmware:

1. Lê pH, ORP, condutividade e as temperaturas da piscina e do coletor solar (simuladas).
2. Mantém os LEDs dos sensores acesos (indicam que o canal está ativo).
3. Aciona/desliga o relé conforme a química da água esteja **fora** ou **dentro** da faixa ideal.
4. Atualiza o LCD (alternando entre duas telas).
5. Publica todas as leituras nos tópicos MQTT do broker local.

Wi-Fi e MQTT são **não-bloqueantes** na operação: se a rede ou o broker caírem, o sistema
continua operando localmente (LEDs, LCD e relé) e tenta reconectar em segundo plano.

---

## Hardware e pinagem

| Componente | Pino | Função |
|---|---|---|
| ESP32 (DevKit) | — | Microcontrolador principal |
| LED pH | **D4** | Indicador do canal de pH |
| LED Wi-Fi | **D5** | Aceso = Wi-Fi conectado |
| LED ORP | **D18** | Indicador do canal de ORP |
| LED Condutividade | **D19** | Indicador do canal de condutividade |
| Relé | **D26** | Acionado quando a química sai da faixa (ativo em **LOW**) |
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
| Temperatura piscina | — | telemetria (publicada via MQTT) |
| Temperatura coletor | — | telemetria (publicada via MQTT) |

---

## Lógica de acionamento do relé

O relé é acionado pela **química da água**, com proteção **anti-cycling**:

```
Qualquer um de {pH, ORP, EC} FORA da faixa  →  LIGA o relé
Todos {pH, ORP, EC} DENTRO da faixa         →  DESLIGA o relé
Intervalo mínimo entre mudanças: 60 s (anti-cycling)
```

A primeira mudança de estado após o boot é liberada imediatamente (`primeiroCiclo`), sem
esperar os 60 s. As temperaturas são lidas e publicadas como telemetria, mas **não**
participam dessa lógica.

---

## LEDs

Os três LEDs dos sensores (pH, ORP, condutividade) ficam **sempre acesos** durante a
operação, indicando que os respectivos canais estão ativos. O LED de Wi-Fi (**D5**) reflete
o estado da conexão: aceso = conectado, apagado = desconectado.

No boot, os três LEDs de sensor fazem um breve teste de piscadas em sequência.

---

## Display LCD

O endereço I2C é **detectado automaticamente** em uma única varredura do barramento, dando
preferência aos endereços comuns de backpack (`0x27`, `0x3F`, `0x20`, `0x38`). Se nenhum
display for encontrado, o sistema continua funcionando normalmente sem ele (`lcdOK = false`).

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

## Comunicação MQTT (HiveMQ local)

Conexão **MQTT sem TLS** na porta **1883** com um broker **HiveMQ rodando na rede local**.
O `clientId` é único por dispositivo (derivado dos 48 bits do MAC do ESP32). A reconexão é
não-bloqueante (tenta a cada 5 s) e usa **LWT** (Last Will & Testament): se o ESP32 cair, o
broker publica `offline` automaticamente.

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

### Subir um HiveMQ local

1. Baixe o **HiveMQ Community Edition** (ou use **Mosquitto**) no seu computador/servidor.
2. Inicie o broker na porta padrão **1883** (sem TLS).
3. Anote o **IP da máquina** na rede (ex.: `192.168.1.100`) e coloque em `MQTT_HOST`.
4. Para visualizar as mensagens, assine `aquasense/#` em qualquer cliente MQTT
   (MQTT Explorer, mosquitto_sub, etc.).

---

## Configuração

Edite **apenas** estas linhas no início de `AquaSense.ino`:

```cpp
// Wi-Fi
const char* WIFI_SSID = "SUA_REDE_WIFI";
const char* WIFI_PASS = "SUA_SENHA_WIFI";

// Broker HiveMQ local
const char* MQTT_HOST = "192.168.1.100";   // IP da máquina onde o broker está rodando
const int   MQTT_PORT = 1883;              // porta MQTT sem TLS

// Login do broker (deixe vazio se o broker for anônimo)
const char* MQTT_USER = "";
const char* MQTT_PASS = "";
const bool  MQTT_USA_LOGIN = false;        // true para conectar com usuário/senha
```

- Se o broker **não** exigir autenticação, mantenha `MQTT_USA_LOGIN = false`.
- Se exigir, preencha `MQTT_USER` / `MQTT_PASS` e troque para `MQTT_USA_LOGIN = true`.

> O ESP32 e o broker precisam estar na **mesma rede**. Como não há TLS, esta configuração é
> adequada para **protótipo, testes e uso acadêmico** em rede local confiável.

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
2. **Placa:** selecione *ESP32 Dev Module* (ou a sua variante) em **Tools → Board**.
3. **Bibliotecas:** instale `PubSubClient` e `LiquidCrystal_I2C`.
4. **Pasta do sketch:** o Arduino IDE exige que `AquaSense.ino` esteja dentro de uma pasta
   chamada `AquaSense/`. Ao abrir o arquivo da raiz do repositório, o IDE oferece criar essa
   pasta automaticamente — aceite. (Alternativa: copie o `.ino` para `AquaSense/AquaSense.ino`.)
5. **Credenciais:** preencha Wi-Fi e o IP do broker (seção [Configuração](#configuração)).
6. **Upload:** conecte o ESP32 via USB, selecione a porta e clique em *Upload*.
7. Abra o **Serial Monitor** a **115200 baud** para acompanhar o boot e as leituras.

> Se o upload travar no meio (`chip stopped responding`), reduza o **Upload Speed** para
> `115200`, troque o cabo USB (use um que transmita dados) e ligue direto numa porta do
> computador (sem hub).

---

## Comportamento no boot

```
======================================
 AquaSense IoT - HiveMQ Local + LCD
======================================
[LCD] Escaneando barramento I2C...
[LCD] Dispositivo encontrado em 0x27
[LCD] Usando endereco 0x27
[LCD] Inicializado com sucesso.
... (teste dos 3 LEDs piscando) ...
[WiFi] Conectando a SUA_REDE_WIFI
[WiFi] Conectado. IP: 192.168.0.42
[MQTT] Broker local: 192.168.1.100:1883
[MQTT] Client ID: aquasense-XXXXXXXXXXXX
[MQTT] Conectando ao HiveMQ local... OK
```

Durante a operação, cada ciclo imprime uma linha de diagnóstico:

```
pH=7.40 ORP=700 EC=1100 Tp=24.0 Ts=28.0 dT=4.0 B=OFF  WiFi=OK  MQTT=OK
```

---

## Utilitário: apagar memória

Em `ferramentas/ApagarMemoria/ApagarMemoria.ino` há um **sketch separado** para "zerar" o
ESP32 quando necessário:

- Apaga toda a partição **NVS** (Preferences e dados salvos).
- Apaga as **credenciais de Wi-Fi** guardadas pelo SDK.
- Sinaliza o resultado pelos LEDs:
  - **Trabalhando** → os LEDs piscam juntos, devagar.
  - **Sucesso** → varredura contínua dos LEDs (efeito sequencial), em loop.
  - **Falha** → todos os LEDs acesos fixos.

**Uso:** abra e grave esse sketch, aguarde a sinalização de sucesso e depois **regrave o
`AquaSense.ino`** para voltar à operação normal. Acompanhe também o Serial a 115200 baud.

> ⚠️ Operação destrutiva: remove dados persistidos e credenciais de rede do ESP32.

---

## Troubleshooting

| Sintoma | Causa provável | Solução |
|---|---|---|
| Upload trava no meio (`chip stopped responding`) | Cabo/porta USB instável ou velocidade alta | Upload Speed `115200`, cabo de dados, porta direta no PC |
| Erro de compilação: `no member named 'init'` | Biblioteca LiquidCrystal_I2C de autor diferente | Use a **de Frank de Brabander** (usa `begin()`) |
| LCD em branco / só blocos | Sem GND comum, ou alimentado em 3,3 V | Use 5 V e ligue o GND do LCD ao GND do ESP32 |
| `[LCD] Nenhum dispositivo I2C encontrado` | Endereço I2C diferente ou fiação errada | Confira SDA=D21 / SCL=D22; veja o endereço impresso na varredura |
| `[WiFi] Falhou no boot` | SSID/senha errados, ou rede 5 GHz | ESP32 usa 2,4 GHz; confira credenciais |
| MQTT `rc=-2` | Broker inacessível | Confira o IP em `MQTT_HOST`, a porta 1883 e se o broker está no ar |
| MQTT `rc=4` / `rc=5` | Credenciais inválidas / não autorizado | Verifique `MQTT_USER` / `MQTT_PASS` e `MQTT_USA_LOGIN` |
| MQTT `rc=-4` | Timeout | ESP32 e broker em redes diferentes, ou broker indisponível |
| Relé não muda | Anti-cycling ativo | Aguarde o intervalo de 60 s entre mudanças |

Códigos `rc` são o retorno de `PubSubClient::state()`.

---

## Estrutura do repositório

```
AquaSense.ino                              ← firmware PRINCIPAL (ESP32 / Arduino C++)
README.md                                  ← esta documentação
ferramentas/
  ApagarMemoria/
    ApagarMemoria.ino                      ← utilitário para apagar NVS + credenciais WiFi
wokwi/
  main.py                                  ← versão EXPERIMENTAL em MicroPython (Wokwi)
```

> **`AquaSense.ino` é o firmware principal e oficial do projeto.**
> A pasta `wokwi/` contém uma versão experimental em MicroPython (simulação no Wokwi, com
> broker público, dosagem química autônoma e integração com Alexa) — usada apenas para
> experimentos e **não** é a base de produção.
