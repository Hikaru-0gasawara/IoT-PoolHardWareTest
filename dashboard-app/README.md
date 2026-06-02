# AquaSense IoT — Dashboard

Dashboard de monitoramento em tempo real do sistema **AquaSense IoT** — uma piscina com coletor solar instrumentada por um ESP32 (IBMEC São Paulo · Invivio Tecnologia).

## Stack

- **TanStack Start** (React 19 + TypeScript + Vite)
- **Tailwind v4** com design tokens em `oklch`
- **Recharts** para os gráficos históricos
- **Framer Motion** para animações
- **Zustand** como store global (`src/store/poolStore.ts`)
- **MQTT.js** sobre WebSocket Secure para consumir telemetria do ESP32

## Como rodar

```bash
bun install
bun dev
```

Acesse `http://localhost:5173`.

## Arquitetura

- **Hardware:** ESP32 lê os sensores da piscina e do coletor solar a cada **5 segundos** e publica via MQTT.
- **Broker:** `broker.hivemq.com` (TCP 1883 para o ESP32, WSS 8884 para o dashboard).
- **Namespace:** `aquasense-ibmec/`.
- **Tópico consolidado:** `aquasense-ibmec/data` (payload flat, ver schema abaixo).
- **Provider:** `src/providers/MqttProvider.tsx` assina `aquasense-ibmec/#`, valida o payload com Zod e empurra cada amostra para o `poolStore` via `ingestFromMqtt()`. Toda a UI lê desse store — nenhum componente faz fetch direto.
- **Fallback:** se o broker ficar > 15 s sem mensagem, uma simulação local entra em ação automaticamente. Um banner discreto avisa o usuário; quando o MQTT volta, o dashboard volta silenciosamente para os dados reais.

### Schema do payload `aquasense-ibmec/data`

```json
{
  "projeto": "AquaSense IoT",
  "cycle": 42,
  "ph": 7.35,
  "orp_mv": 650.3,
  "chlorine": 2.50,
  "alkalinity": 95.0,
  "temp_pool": 26.5,
  "humidity": 65.0,
  "temp_solar": 42.3,
  "delta_t": 15.8,
  "pump": "ON",
  "alerts": []
}
```

Valores `-99.0` em campos numéricos sinalizam erro de sensor — a UI mostra `ERRO` no card correspondente.

## Controle de aquecimento (firmware)

O controle da bomba acontece **no ESP32**, não no dashboard:

- Liga quando `ΔT = T_solar − T_piscina ≥ 5°C`
- Desliga quando `ΔT ≤ 1°C`
- Anti-cycling de **60 segundos** entre mudanças de estado

O dashboard exibe o estado atual e o histórico de acionamentos, mas não envia comandos.

## Faixas ideais (piscina)

| Parâmetro | Faixa ideal |
|---|---|
| pH | 7.2 – 7.6 |
| Cloro livre | 1.0 – 3.0 ppm |
| Alcalinidade | 80 – 120 ppm CaCO₃ |
| Temperatura | 26 – 30 °C |

## Hardware (referência do produto final)

- **ESP32 DevKit V1** (Wi-Fi)
- Sensor de pH **E-201-C + módulo PH-4502C**
- **Eletrodo ORP** industrial (cloro)
- Sonda de **condutividade** (alcalinidade)
- Sensores submersos digitais para temperatura da piscina e do coletor solar
- **LCD 20×4 I²C** local
- **Relé opto-isolado** acionando bomba **1CV 220V**

## Equipe

- **Grupo 1** — controle de aquecimento: Martim Roxo · Vitor Yoshida
- **Grupo 2** — qualidade da água: João Perestrelo · Hikaru · Roan
- **Professor:** Marcel Stefan Wagner, PhD
- **Empresa parceira:** Invivio Tecnologia Ltda.

## Equipe

- **Grupo 1** (controle de aquecimento): Martim Roxo · Vitor Yoshida
- **Grupo 2** (medição de água): João Perestrelo · Hikaru · Roan
- **Professor:** Marcel Stefan Wagner, PhD

---

## Refatoração crítica (Abril 2026)

Cinco mudanças cirúrgicas para alinhar o dashboard à realidade operacional do ESP32 e eliminar discrepâncias entre componentes.

### 1. Header unificado
Uma única system bar com hierarquia clara: **água > MQTT > debug**. Eliminados indicadores duplicados que conflitavam entre si.

### 2. Cor da bomba (semântica)
Bomba ativa agora usa **azul (`--flow`)** em vez de verde. Verde é reservado para "tudo ok / dentro da faixa"; azul comunica "fluxo / movimento", que é o que a bomba representa.

### 3. Alertas agregados
Antes: cada ciclo fora da faixa virava um alerta novo na lista (poluição visual, 50+ entradas em minutos). Agora: **1 anomalia = 1 registro agregado** com:
- Abre após **3 ciclos consecutivos** fora da faixa (anti-flap)
- Fecha após **5 ciclos consecutivos** dentro da faixa
- Escalação **in-place** `warn → crit` (zera ack, mantém `iniciado_em`, registra `severity_max`)
- Não desescala enquanto não resolver completamente
- Estados: `ativo` → `reconhecido` (ack) → `resolvido`
- Painel "live alerts" raw preservado como visão complementar

### 4. Fonte MQTT única (`describeMqttStatus`)
Antes: Header usava `useConnection()`, SettingsPanel usava `mqtt_online` hardcoded `true`, Logs tinha terceira fonte. Agora: **uma função pura** (`src/lib/mqttStatus.ts`) consumida por todos, com lógica de obsolescência baseada em `now - lastMessageAt`:
- `< 10s`: "agora mesmo" (verde)
- `10–30s`: "há Xs" (neutro)
- `30s–5min`: "dados obsoletos" (âmbar)
- `> 5min`: "ESP32 sem resposta" (vermelho)
- `source === "fallback"`: "modo simulação local" (independe do tempo)

Removidos do store: `mqtt_online` (sempre `true`, mentia) e `wifi_rssi` (random walk simulado, não vinha do firmware).

### 5. Tabular-nums cirúrgico
Nova classe `.tnum` (`font-variant-numeric: tabular-nums` sem alterar `font-family`) aplicada **apenas** no badge "Circulando há Xs" do Hero, onde número e texto se misturam em fonte sans. O `.font-tabular` (mono) foi preservado em logs, timestamps e números display — é estética técnica intencional.

## Cobertura de testes

**29/29 cenários validados** durante a refatoração:
- 12 cenários para alertas agregados (abertura, fechamento, escalação, ack persistente, oscilação sub-3-ciclos, shadow leak entre parâmetros)
- 12 cenários para `describeMqttStatus` (matriz completa de connection × source × age)
- 5 cenários integrados de fluxo end-to-end

**Status atual dos testes:** executados como scripts ad-hoc via `bunx tsx` em `/tmp/` durante a refatoração — **ainda não promovidos** para uma suite permanente (`vitest`) no repo. Bugs reais foram encontrados pelos testes (shadow vazando entre parâmetros no `activeByParam`; campo `mqtt_online` fantasma sempre `true`), validando o investimento.

## Decisões de arquitetura

- **Fonte única MQTT** — toda info de conexão sai de `describeMqttStatus()`. Componentes nunca renderizam status hardcoded.
- **Alertas agregados no `poolStore`** — provider só parseia, store carrega lógica de domínio (anti-flap, escalação, ack lifecycle).
- **Tabular-nums cirúrgico** — `.tnum` (apenas a feature) coexiste com `.font-tabular` (mono + feature). Use `.tnum` quando texto + número se misturam; `.font-tabular` para números puros que devem parecer "instrumento".
- **Fallback honesto** — quando o broker silencia, simulação local entra com banner explícito. Nada de mentir "Conectado" enquanto serve mock.

## TODOs (evolução documentada)

Itens identificados durante a refatoração, **conscientemente adiados** após análise de custo × valor:

| # | Item | Prioridade | Justificativa |
|---|------|------------|---------------|
| 1 | Ack persistente entre F5 (separar `id` instância de `ack_key` determinística + localStorage com TTL) | Baixa | Valor baixo, custo médio. Operador pode simplesmente reconhecer de novo após refresh. |
| 2 | `wifi_rssi` real do firmware | Fora de escopo | Exige mudança em `main.py` + Wokwi + schema. Melhor não exibir do que simular. |
| 3 | Destaque visual extra para modo fallback no SettingsPanel | Opcional | Banner âmbar global já comunica. |
| 4 | Badge "atingiu crit" em alertas resolvidos (expor `severity_max` na UI) | **Próximo se sobrar tempo** | ~5 min de trabalho, valor médio, mais visível. |
| 5 | Promover testes ad-hoc para suite vitest permanente | Média | Lógica testada, mas regressões futuras passariam batidas sem rodar manualmente. |
