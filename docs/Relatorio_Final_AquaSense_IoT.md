# AquaSense IoT — Relatório Final de Projeto

**Sistema IoT de Monitoramento da Qualidade da Água e Automação do Aquecimento Solar de Piscinas**

| | |
|---|---|
| **Instituição** | IBMEC São Paulo — Engenharia, Sistemas Embarcados |
| **Grupo 2 — Qualidade da Água e Dashboard** | João Victor Perestrelo · Hikaru Ogasawara · Roan Ribeiro Mariotto |
| **Grupo 1 — Controle de Aquecimento Solar** | Martim Roxo · Vitor Yoshida |
| **Orientação** | Prof. Marcel Stefan Wagner, PhD |
| **Parceria** | Invivio Tecnologia Ltda. |
| **Data** | São Paulo — Junho de 2026 |
| **Repositório** | `Hikaru-0gasawara/IoT-PoolHardWareTest` |
| **Demo pública** | <https://aquasense-iot.pages.dev> |

---

## Sumário

1. [Introdução](#1-introdução)
2. [Arquitetura do Sistema](#2-arquitetura-do-sistema)
3. [Hardware](#3-hardware)
4. [Parâmetros Monitorados e Lógica de Controle](#4-parâmetros-monitorados-e-lógica-de-controle)
5. [Protocolo MQTT](#5-protocolo-mqtt)
6. [Dashboard Web](#6-dashboard-web)
7. [Interface de Voz — Skill Alexa (pt-BR)](#7-interface-de-voz--skill-alexa-pt-br)
8. [Qualidade de Software e Segurança da Informação](#8-qualidade-de-software-e-segurança-da-informação)
9. [Segurança Operacional e Roadmap de Controle Autônomo](#9-segurança-operacional-e-roadmap-de-controle-autônomo)
10. [Metodologia de Desenvolvimento e Testes](#10-metodologia-de-desenvolvimento-e-testes)
11. [Dificuldades Encontradas e Soluções](#11-dificuldades-encontradas-e-soluções)
12. [Resultados e Conclusão](#12-resultados-e-conclusão)
13. [Referências](#13-referências)

---

## 1. Introdução

A manutenção da qualidade da água de piscinas exige medições frequentes de parâmetros
físico-químicos (pH, cloro livre, alcalinidade, potencial de oxirredução) e o gerenciamento do
sistema de aquecimento solar. Quando feita manualmente, essa rotina é sujeita a esquecimentos,
leituras espaçadas e desperdício de energia — a bomba de circulação do coletor solar pode operar
em momentos em que não há ganho térmico, ou deixar de operar quando há.

O **AquaSense IoT** é um sistema embarcado completo que automatiza esse processo. Um
microcontrolador **ESP32** monitora continuamente a água da piscina e a temperatura do coletor
solar, aciona a bomba de circulação por lógica de **histerese térmica (ΔT)**, exibe o estado em um
display LCD local e publica toda a telemetria via protocolo **MQTT**. Sobre essa infraestrutura,
duas interfaces de usuário foram construídas: um **dashboard web** em React/TypeScript com
atualização em tempo real (e exportação de relatório diário em PDF) e uma **skill de voz para
Amazon Alexa** em português brasileiro.

O projeto foi desenvolvido na disciplina de Sistemas Embarcados do IBMEC São Paulo, sob orientação
do Prof. Marcel Stefan Wagner, PhD, em parceria com a empresa Invivio Tecnologia Ltda. O trabalho
foi dividido entre dois grupos: o **Grupo 1**, responsável pelo subsistema de aquecimento solar, e
o **Grupo 2**, responsável pelo monitoramento da qualidade da água e pelo dashboard.

### 1.1 Objetivos

- Monitorar em tempo real **pH, cloro livre, alcalinidade, ORP, condutividade, umidade** e as
  **temperaturas da piscina e do coletor solar**, com ciclo de aquisição de **5 segundos**.
- Automatizar o acionamento da **bomba do coletor solar** por diferença de temperatura (ΔT), com
  histerese e proteção anti-cycling.
- Publicar a telemetria via **MQTT** em um namespace padronizado (`aquasense-ibmec-pt`),
  permitindo múltiplos clientes simultâneos.
- Disponibilizar um **dashboard web** responsivo com visualização em tempo real, histórico,
  alertas, envio de comandos e **exportação de resumo diário em PDF**.
- Disponibilizar uma **interface de voz** (Alexa, pt-BR) para consulta de telemetria e envio de
  comandos de modo e dosagem, com confirmação por voz para ações sensíveis.
- Sinalizar localmente o estado do sistema por **LCD 16×2** e **LEDs de alarme** por parâmetro.
- Publicar uma **demonstração pública** do dashboard (modo demo, sem credenciais) acessível por
  QR code.
- Documentar o **roadmap de evolução** para controle autônomo de dosagem química com camadas de
  segurança.

---

## 2. Arquitetura do Sistema

A arquitetura segue o padrão **publish/subscribe** do MQTT, com o broker como ponto central de
integração. O ESP32 publica a telemetria e assina os tópicos de comando; o dashboard e a skill
Alexa consomem os mesmos dados e publicam comandos pelos mesmos tópicos — **nenhum cliente fala
diretamente com outro**.

```
┌──────────┐   TCP 1883 (ou TLS 8883)   ┌─────────────────┐   WSS 8884   ┌────────────────┐
│  ESP32   │ ─────────────────────────► │  Broker HiveMQ  │ ◄─────────── │  dashboard-app │
│ firmware │     aquasense-ibmec-pt/*   │ (cloud/público) │   (browser)  │   (React/TS)   │
└──────────┘                            └─────────────────┘ ◄─────────── └────────────────┘
                                                  ▲              WSS
                                                  └── Skill Alexa (Lambda Node.js)
```

- O **ESP32** lê os sensores a cada 5 s e publica o tópico consolidado
  `aquasense-ibmec-pt/dados` (JSON, `retain=true`) — a **fonte de verdade** dos clientes — além de
  tópicos granulares, saúde do sistema (a cada 60 s) e o estado de controle.
- O **dashboard** assina `aquasense-ibmec-pt/#`, valida cada payload com **schemas Zod** e
  renderiza os dados. Se o broker ficar mais de **15 s** sem mensagens, entra em **simulação
  local** com um banner discreto e retorna automaticamente aos dados reais quando o ESP32
  reaparece.
- A **skill Alexa** abre, a cada invocação, uma conexão MQTT **efêmera** (WSS), lê o snapshot
  retido de `dados` ou publica um comando, e encerra a conexão — estratégia adequada ao timeout de
  8 s da plataforma Alexa.
- **Comandos** fluem no sentido inverso: dashboard e Alexa publicam em `controle/modo`,
  `controle/dosagem/modo` e `dosagem/comando`; o firmware processa e responde com
  `controle/estado` e `dosagem/evento`.

### 2.1 Estratégia de broker

Duas configurações são suportadas, selecionadas no firmware pela diretiva `USAR_TLS`:

| Configuração | Broker | Porta | Autenticação | Uso |
|---|---|---|---|---|
| `USAR_TLS 1` *(padrão)* | Cluster HiveMQ Cloud | 8883 (TLS) | Usuário/senha | Produção — tráfego criptografado; **casa com o dashboard** |
| `USAR_TLS 0` | `broker.hivemq.com` (público) | 1883 | Nenhuma | Demonstração e testes — zero configuração |

Um risco de integração recorrente identificado durante o desenvolvimento foi o **descasamento de
broker** entre firmware, dashboard e skill: os três componentes precisam apontar para o **mesmo
cluster**. Por isso, na versão final, os três componentes convergem por padrão para o **mesmo
cluster HiveMQ Cloud** (o default do firmware é `USAR_TLS 1`), e o broker público permanece
disponível como modo de teste rápido sem credenciais (`USAR_TLS 0` no firmware +
`VITE_MQTT_URL=wss://broker.hivemq.com:8884` no dashboard).

No dashboard, as credenciais **não são mais hardcoded**: são fornecidas via variáveis de ambiente
(`VITE_MQTT_URL`, `VITE_MQTT_USERNAME`, `VITE_MQTT_PASSWORD`) em arquivo `.env.local` (gitignored),
com um `.env.example` documentado no repositório (ver seção 8).

---

## 3. Hardware

O protótipo é construído sobre um **ESP32 DevKit V1** (framework Arduino), com display **LCD 16×2**
via módulo I2C PCF8574 (endereços 0x27/0x3F, detectados automaticamente no boot), **relé** para a
bomba do coletor e **LEDs de sinalização**. No protótipo de validação, os sensores físicos são
substituídos por **leituras simuladas** (funções senoidais de período longo que cruzam
deliberadamente as faixas de alerta), o que permitiu validar todo o hardware de sinalização, o
protocolo MQTT e a lógica de controle de ponta a ponta antes da integração dos sensores reais.

### 3.1 Pinagem

| Componente | Pino | Função |
|---|---|---|
| LED pH | D4 | Aceso quando o pH está fora da faixa ideal |
| LED Wi-Fi | D5 | Aceso quando o Wi-Fi está conectado |
| LED Cloro | D18 | Aceso quando o cloro está fora da faixa ideal |
| LED Alcalinidade | D19 | Aceso quando a alcalinidade está fora da faixa ideal |
| LCD I2C — SDA | D21 | Barramento I2C (dados) |
| LCD I2C — SCL | D22 | Barramento I2C (clock) |
| Relé (bomba) | D26 | Bomba do coletor solar — **ativo em nível baixo** |

Observações de hardware relevantes documentadas durante a montagem:

- O relé é **ativo em nível baixo** (`RELE_ACTIVE_LOW = 1`).
- O LCD deve ser alimentado em **5 V** com **GND comum** ao ESP32 — sem o GND compartilhado os
  sinais I2C não chegam e o display permanece em branco.
- O módulo backpack I2C precisa estar **fisicamente soldado** à placa do LCD.
- O ESP32 só conecta em redes Wi-Fi **2,4 GHz** (redes 5 GHz não são suportadas pelo chip).

### 3.2 Sensores previstos

Para a fase com sensores reais, a especificação prevê: eletrodo de **pH E-201-C** com módulo
condicionador PH-4502C, eletrodo de **ORP**, sensor de **condutividade** e **termistores NTC
10 kΩ** (temperaturas da piscina e do coletor), linearizados pela equação de **Steinhart-Hart**.
A gravação do firmware é feita via cabo USB (chip serial CP2102, `/dev/ttyUSB0`, 115200 baud), com
a placa selecionada explicitamente como "ESP32 Dev Module" (FQBN `esp32:esp32:esp32`).

---

## 4. Parâmetros Monitorados e Lógica de Controle

### 4.1 Faixas ideais (ABNT NBR 10818)

As faixas de referência seguem a norma **ABNT NBR 10818** e são as mesmas no firmware, no
dashboard (`thresholds.ts` — fonte única de verdade da UI) e na skill Alexa:

| Parâmetro | Faixa ideal | Sinalização |
|---|---|---|
| pH | 7,2 – 7,6 | LED D4 + alerta no dashboard |
| Cloro livre | 1,0 – 3,0 ppm | LED D18 + alerta no dashboard |
| Alcalinidade | 80 – 120 ppm | LED D19 + alerta no dashboard |
| ORP | telemetria | Publicado em `dados` |
| Condutividade | telemetria | Publicado em `dados` (`condutividade_us_cm`) |
| Temperatura piscina / coletor | telemetria | Controla a bomba (ΔT) |
| Umidade | telemetria | Publicado em `dados` |

O valor sentinela **`-99.0`** em qualquer campo numérico sinaliza **erro de sensor**; o dashboard
exibe "ERRO" no card correspondente e a leitura inválida **bloqueia qualquer dosagem** do parâmetro
afetado.

### 4.2 Grandezas derivadas (firmware v3.1)

A partir da versão 3.1, o firmware alinha o protocolo ao dashboard e passa a derivar grandezas
químicas de medições eletroquímicas mais robustas:

- O **cloro livre é derivado do ORP + pH** por equação de **Nernst simplificada**
  (compensação de ~59,16 mV por unidade de pH acima de 7,0).
- A **alcalinidade é derivada da condutividade** (µS/cm).
- O campo `condutividade_us_cm` tornou-se **obrigatório** no payload consolidado — o schema Zod do
  dashboard rejeita payloads sem ele (proteção de contrato).

### 4.3 Acionamento da bomba do coletor solar

O controle da bomba usa **histerese térmica** sobre o ΔT (temperatura do coletor − temperatura da
piscina), evitando oscilações rápidas do relé:

| Condição | Ação |
|---|---|
| ΔT ≥ 5 °C | Liga a bomba |
| ΔT ≤ 1 °C | Desliga a bomba |
| Última mudança há menos de 60 s | **Anti-cycling**: comando ignorado |

Vale destacar que a lógica da bomba é **exclusivamente térmica** — não depende dos parâmetros
químicos da água. Essa separação de responsabilidades foi tratada como **invariante do projeto**,
pois regressões nesse ponto foram identificadas e corrigidas durante o desenvolvimento iterativo
do dashboard.

---

## 5. Protocolo MQTT

Todo o sistema usa o namespace **`aquasense-ibmec-pt`**. Os tópicos de telemetria são publicados
com **`retain=true`**, garantindo que qualquer cliente novo receba imediatamente o último estado ao
assinar. O tópico `sistema/status` usa **LWT (Last Will and Testament)** para sinalizar
online/offline automaticamente.

| Tópico (sufixo) | Direção | Descrição |
|---|---|---|
| `dados` | Publica (retain, 5 s) | Payload consolidado JSON — **fonte de verdade** |
| `piscina/ph`, `piscina/cloro`, `piscina/alcalinidade`, `piscina/temperatura` | Publica (retain) | Valores granulares por parâmetro |
| `coletor/temperatura`, `coletor/bomba` | Publica (retain) | Temperatura do coletor e estado da bomba (`LIGADA`/`DESLIGADA`) |
| `sistema/status` | Publica (retain, LWT) | `online` / `offline` |
| `sistema/saude` | Publica (60 s) | Heap livre, RSSI, tempo ativo, contador de falhas MQTT |
| `controle/estado` | Publica (retain) | Modo atual, parada de emergência, dose em andamento |
| `dosagem/evento` | Publica | Eventos: iniciada / concluída / bloqueada |
| `controle/modo` | Recebe | Comando de modo da bomba: `automatico` · `manual` · `parada` |
| `controle/dosagem/modo` | Recebe | Comando de modo da **dosagem** (independente da bomba) |
| `dosagem/comando` | Recebe | Comando de dosagem: `cloro` · `acido` · `base` (QoS 1) |

O payload de `dados` inclui projeto, número do ciclo, todas as leituras (incluindo ORP e
condutividade), ΔT, estado da bomba, lista de alertas, modo de operação, flag de parada de
emergência e dose em andamento.

Um detalhe de robustez importante: o firmware aceita **somente** as strings de modo `automatico`,
`manual` e `parada` — variantes como "parado" são silenciosamente rejeitadas, o que tornou a
**padronização rígida desses enums** entre os três clientes um requisito de integração.

---

## 6. Dashboard Web

O dashboard oficial (`dashboard-app/`) é uma aplicação **React 19 + TypeScript** construída com
**TanStack Router**, estado global em **Zustand**, conexão MQTT via WebSocket encapsulada em um
`MqttProvider`, validação de payloads com **Zod**, gráficos com **Recharts**, animações com
**Framer Motion**, estilização em **Tailwind CSS**, geração de PDF com **jsPDF** e testes com
**Vitest**. O desenvolvimento foi iterado com auxílio da plataforma Lovable e de agentes de
codificação, a partir de prompts estruturados ancorados na arquitetura real do projeto.

### 6.1 Funcionalidades

- **Visão geral**: painel do sistema solar (piscina ⇄ bomba ⇄ coletor) com ΔT em destaque, mais
  cards dos parâmetros principais com sparkline e estado de faixa.
- **Gráficos**: histórico das leituras com tooltips detalhados e valor em tempo real no cabeçalho
  de cada gráfico.
- **Alertas**: motor de alertas agregados por (parâmetro, severidade) com histerese — abre após
  3 ciclos consecutivos fora da faixa, resolve após 5 dentro; escala warn→crítico sem perder o
  início do incidente; reconhecimentos (acks) persistem entre sessões. Banner de incidente para
  condições críticas (parada de emergência, cloro zerado, dados obsoletos).
- **Exportação em PDF**: resumo diário com cartões de **pH, cloro e alcalinidade**, tabela de
  alertas ativos, gráficos de histórico com faixa ideal sombreada e log de eventos de cloro —
  gerado 100% no cliente com jsPDF (sem servidor).
- **Controle**: envio de comandos de modo (bomba e dosagem, independentes) e dosagem com botão de
  confirmação por **pressão prolongada** (hold-to-confirm), throttle de 1 s contra duplo clique,
  histórico de comandos e log MQTT bruto para diagnóstico.
- **Configuração**: calibração por parâmetro, preferências persistentes e alternância de tema
  claro/escuro (estética editorial com Space Grotesk + JetBrains Mono e tokens de cor OKLCH).
- **Diagnóstico**: saúde do sistema (heap, RSSI, uptime) e documentação do roadmap de controle
  autônomo diretamente na interface.

### 6.2 Resiliência

O dashboard foi projetado para **nunca exibir uma tela vazia**: ao detectar mais de 15 segundos sem
mensagens do broker, ativa um **modo de simulação local** claramente sinalizado por banner, e
retorna sozinho aos dados reais quando o firmware volta a publicar. Payloads malformados são
rejeitados pela camada Zod antes de atingirem o estado da aplicação. O motor de simulação é o
mesmo usado no modo demo público.

### 6.3 Demonstração pública e deploy

O dashboard é publicado no **Cloudflare Pages** (<https://aquasense-iot.pages.dev>). Como a
telemetria é pessoal, a build pública usa o modo **`VITE_PUBLIC_DEMO=true`**, que desativa por
completo a conexão MQTT real e roda o motor de simulação — nenhuma credencial é embutida no bundle
público. Um **QR code** no README aponta para a demonstração. O deploy aplica também cabeçalhos
HTTP de segurança via arquivo `_headers` (X-Frame-Options, X-Content-Type-Options,
Referrer-Policy, Permissions-Policy).

---

## 7. Interface de Voz — Skill Alexa (pt-BR)

A skill customizada **"Monitor da Piscina AquaSense"** (Alexa-hosted, Node.js ≥ 18,
`ask-sdk-core`, `mqtt` 5.x) conversa com o ESP32 pelo mesmo broker MQTT, **sem exigir qualquer
mudança no firmware**: lê o tópico retido `dados` para consultas e publica em `dosagem/comando` e
`controle/modo` para ações. O `config.js` centraliza broker, namespace e credenciais via variáveis
de ambiente — com defaults alinhados ao mesmo cluster HiveMQ Cloud do firmware — e timeout de
4,5 s, margem segura dentro dos 8 s da plataforma.

### 7.1 Interações suportadas

| O usuário diz… | A skill faz |
|---|---|
| "qual o pH" / "qual o cloro" / "qual a alcalinidade" | Lê o snapshot e responde o valor e se está na faixa ideal |
| "qual a temperatura da piscina / do coletor" | Responde a temperatura (e o ΔT quando não especificado) |
| "como está a água" / "resumo" | pH, cloro, alcalinidade, temperatura, bomba e alertas |
| "a bomba está ligada?" | Estado da bomba do coletor + ΔT |
| "dosar cloro" / "adicione ácido" / "dose base" | **Pede confirmação por voz** e publica `dosagem/comando` |
| "modo automático / manual / parada de emergência" | **Pede confirmação por voz** e publica `controle/modo` |

### 7.2 Segurança das ações por voz

- Comandos de **dosagem** e de **mudança de modo** exigem **confirmação explícita por voz** antes
  da publicação (definido no modelo de diálogo, `confirmationRequired` + delegação de diálogo).
- O firmware mantém suas próprias travas: em parada de emergência ou com dose em andamento, o
  comando é bloqueado e o evento é registrado em `dosagem/evento`.
- Sem o ESP32 online (nenhum snapshot retido em `dados`), as consultas **informam que não há
  conexão**, em vez de inventar valores.

### 7.3 Lições do deploy

O primeiro deploy no ambiente Alexa-hosted (à época em Node.js 16) exigiu fixar a dependência
`mqtt` em `^4.3.8` e remover o bloco `engines` do `package.json`. Com a atualização da plataforma
para **Node.js ≥ 18**, o projeto migrou para `mqtt` **5.x** (atualmente `^5.15.1`) e reintroduziu o
bloco `engines` — a lição permanece documentada: **o runtime do ambiente de execução é um requisito
de integração tão rígido quanto o contrato MQTT**.

---

## 8. Qualidade de Software e Segurança da Informação

Na fase final do projeto foi conduzida uma **auditoria completa** do repositório (firmware,
dashboard e skill), resultando em um ciclo de manutenção com as seguintes correções:

| Área | Problema encontrado | Correção |
|---|---|---|
| Dashboard | Credenciais MQTT **hardcoded** no código — o Vite embute `import.meta.env.VITE_*` no bundle JS público | Credenciais movidas para `.env.local` (gitignored) + `.env.example` documentado; sem env, o app roda em simulação local |
| Dashboard | IDs de alerta com timestamp impediam reaplicar acks persistidos ao reabrir um alerta | IDs determinísticos `parametro:severidade` + reaplicação de acks do `localStorage` |
| Dashboard | Relatório PDF omitia o **pH** (só cloro e alcalinidade) | pH incluído nos cartões, alertas e gráficos do PDF (grade de 3 colunas) |
| CI | Pipeline rodava lint e testes, mas não checagem de tipos | Etapa `typecheck` (tsc) adicionada ao GitHub Actions |
| Deploy | Sem cabeçalhos de segurança HTTP | `_headers` no Cloudflare Pages (X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy) |
| Alexa | Defaults do broker desalinhados do firmware; mudança de modo sem confirmação | Defaults alinhados ao cluster do firmware; `confirmationRequired` no `DefinirModoIntent` |
| Firmware | Simulação não cruzava as faixas de alerta (alertas nunca disparavam em demo); contador de falhas MQTT fictício | Senoides recalibradas para cruzar faixas; contador real de falhas |

A suíte de testes do dashboard cobre **151 testes em 16 arquivos** (schemas Zod, store Zustand,
motor de alertas, motor de simulação, comandos MQTT, histórico de comandos e utilitários),
executada em CI (GitHub Actions) junto com ESLint/Prettier e `tsc --noEmit`.

---

## 9. Segurança Operacional e Roadmap de Controle Autônomo

O sistema atual opera como **monitor com controle térmico** (Fase 1). A evolução planejada
(Fase 2, validada em simulação Wokwi) adiciona **dosagem química autônoma** — e, por envolver
produtos químicos em contato com banhistas, foi especificada com **oito camadas de segurança**
verificadas **em ordem** antes de qualquer dose:

| # | Camada | Descrição |
|---|---|---|
| 1 | E-Stop ativo | Nada dosa, sem exceção — verificação primeiro em hardware, depois em firmware |
| 2 | Modo de operação | Só dosa em modo automático; boot conservador em manual |
| 3 | Sensor com erro | Leitura inválida (`-99.0`) bloqueia dosagem do parâmetro afetado |
| 4 | Dose em andamento | Uma dosadora por vez, nunca simultaneamente |
| 5 | Dead time | 30–60 min entre doses do mesmo produto, aguardando mistura completa |
| 6 | Interlock pH/cloro | Nunca dosar ácido/base junto com cloro — risco de gás cloro tóxico |
| 7 | Limite horário | Máximo de doses por hora — proteção contra loop de realimentação |
| 8 | Limite diário | Máximo de doses por dia — proteção contra falha crônica de sensor |

O roadmap considera ainda requisitos regulatórios: **NBR 10818** (faixas de qualidade da água),
regulação **ANVISA** para produtos químicos, **NBR 13534** (instalações elétricas em locais
úmidos — E-Stop físico e isolamento de relés) e responsabilidade civil em piscinas comerciais, que
exige **log persistente** como prova de auditoria. A Fase 3 (futura) prevê sensores redundantes,
certificação e monitoramento remoto profissional.

---

## 10. Metodologia de Desenvolvimento e Testes

- **Validação em simulador antes do hardware**: cada versão do firmware foi validada no **Wokwi**
  antes da gravação no ESP32 físico.
- **Sensores simulados no protótipo**: funções senoidais de período longo — calibradas para cruzar
  as faixas de alerta — permitiram testar protocolo, LCD, LEDs, motor de alertas e lógica da bomba
  ponta a ponta sem o hardware de sensores.
- **Testes de integração com broker**: publicação manual de snapshots retidos com `mosquitto_pub`
  para validar dashboard e skill Alexa sem o dispositivo ligado.
- **Testes automatizados do dashboard**: suíte Vitest (151 testes) cobrindo schemas Zod, store
  Zustand, motor de alertas e de simulação, comandos MQTT e utilitários, executada em CI (GitHub
  Actions) com lint e typecheck.
- **Diagnóstico disciplinado**: falhas de Wi-Fi se disfarçam de falhas MQTT — o procedimento
  padronizado foi sempre verificar primeiro o Wi-Fi pelo Serial Monitor (115200 baud) antes de
  investigar o broker.
- **Ferramentas de manutenção**: utilitário `ferramentas/BlinkLimpaMemoria` para limpar NVS e
  credenciais Wi-Fi residuais do ESP32 (com feedback visual por LED).
- **Revisões e auditoria**: ciclo final de auditoria de código cobrindo contrato
  firmware↔dashboard↔Alexa, segurança de credenciais e regressões (ver seção 8).

---

## 11. Dificuldades Encontradas e Soluções

| Problema | Causa | Solução |
|---|---|---|
| Display LCD em branco | Alimentação em 3,3 V e/ou ausência de GND comum; backpack I2C não soldado | Alimentar em 5 V, GND compartilhado, soldagem do módulo I2C |
| ESP32 não detectado na gravação | Auto-detecção de placa falhava | Seleção explícita de "ESP32 Dev Module" (FQBN `esp32:esp32:esp32`) |
| Comandos de modo ignorados | String "parado" enviada; firmware só aceita "parada" | Padronização rígida dos enums nos três clientes |
| Dashboard e ESP32 sem se ver | Componentes apontando para brokers diferentes | Convenção única de broker (HiveMQ Cloud por padrão nos três clientes) |
| Payload rejeitado pelo dashboard | Campo `condutividade_us_cm` ausente no firmware antigo | Firmware v3.1 alinhado ao schema Zod do dashboard |
| Deploy Alexa rejeitado | `mqtt` 5.x e bloco `engines` exigiam Node ≥ 18 (ambiente era Node 16) | Downgrade temporário para `mqtt ^4.3.8`; migração definitiva para 5.x quando a plataforma passou a Node ≥ 18 |
| Falhas intermitentes de conexão | Wi-Fi caindo, interpretado como problema de MQTT | Diagnóstico Wi-Fi primeiro, via Serial Monitor |
| Credenciais expostas no bundle | Vite embute `VITE_*` no JS público em build | Credenciais via `.env.local` (gitignored); demo público 100% simulado |
| Alertas nunca disparavam na demo | Senoides da simulação não cruzavam as faixas de alerta | Recalibração das senoides + contador real de falhas MQTT |
| Acks de alerta perdidos ao reabrir | IDs de alerta continham timestamp (não determinísticos) | IDs `parametro:severidade` + reaplicação dos acks persistidos |

---

## 12. Resultados e Conclusão

O AquaSense IoT atingiu os objetivos propostos: o **firmware v3.1** publica telemetria completa a
cada 5 segundos com confiabilidade (retain + LWT), incluindo grandezas derivadas por modelo
físico-químico (cloro via Nernst, alcalinidade via condutividade); a **bomba do coletor** é
acionada corretamente pela histerese de ΔT com proteção anti-cycling; o **dashboard** exibe e
comanda o sistema em tempo real com degradação graciosa quando o dispositivo está offline, exporta
relatório diário em PDF e mantém uma demonstração pública permanente em
<https://aquasense-iot.pages.dev>; e a **skill Alexa** fecha o ciclo de interação por voz em
português, com confirmação verbal para toda ação que altera o estado do sistema — tudo integrado
pelo mesmo broker MQTT, sem acoplamento direto entre os clientes.

Do ponto de vista de engenharia, o projeto consolidou práticas valiosas: **contrato de dados
rígido e versionado** entre firmware e clientes, **validação de payloads na borda** (Zod),
**simulação antes do hardware** (Wokwi), **testes automatizados em CI** (151 testes + lint +
typecheck), **gestão de segredos** (credenciais fora do código-fonte e do bundle público) e
**documentação do roadmap de segurança dentro do próprio produto**. A separação clara entre o
controle térmico (já implementado) e o controle químico autônomo (especificado com oito camadas de
segurança e considerações regulatórias) demonstra maturidade na avaliação de risco de um sistema
ciberfísico que interage com pessoas.

Como trabalhos futuros, destacam-se a **integração dos sensores físicos** (E-201-C, ORP,
condutividade, NTC com Steinhart-Hart), a implementação das **dosadoras peristálticas** com as
camadas de segurança em hardware real, **sensores redundantes**, **log persistente para
auditoria** e a rotação periódica de credenciais do broker em operação contínua.

---

## 13. Referências

- ABNT NBR 10818 — Qualidade de água de piscina.
- ABNT NBR 13534 — Instalações elétricas em locais úmidos (referência para E-Stop e isolamento).
- Documentação HiveMQ — MQTT Cloud Broker e clientes WebSocket (<https://www.hivemq.com>).
- Documentação Espressif ESP32 e framework Arduino-ESP32.
- Amazon Alexa Skills Kit — `ask-sdk-core` e Alexa-hosted skills.
- Documentação das bibliotecas: React, TanStack Router, Zustand, Zod, Recharts, Tailwind CSS,
  Framer Motion, jsPDF, Vitest, mqtt.js.
- Wokwi — Simulador de eletrônica e IoT (<https://wokwi.com>).
- Cloudflare Pages — Hospedagem e cabeçalhos HTTP (<https://developers.cloudflare.com/pages>).
