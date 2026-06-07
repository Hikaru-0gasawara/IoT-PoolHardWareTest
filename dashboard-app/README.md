# AquaSense IoT — Dashboard

Dashboard de monitoramento em tempo real do sistema **AquaSense IoT** — uma piscina com coletor solar instrumentada por um ESP32 (IBMEC São Paulo · Invivio Tecnologia).

## Stack

- **TanStack Start** (React 19 + TypeScript + Vite)
- **Tailwind v4** com design tokens em `oklch`
- **Recharts** para gráficos históricos
- **anime.js v4** + **Framer Motion** para animações e transições de tela
- **Zustand** como store global (`src/store/poolStore.ts`)
- **MQTT.js** sobre WebSocket Secure para telemetria em tempo real
- **Zod** para validação do payload do firmware

## Como rodar

Depois de instalar os pré-requisitos do seu sistema (abaixo), os comandos são os mesmos:

```bash
cd dashboard-app
npm install      # ou: bun install
npm run dev      # ou: bun dev
```

Acesse `http://localhost:4173`. Para parar o servidor, use `Ctrl + C` no terminal.

### Pré-requisitos por sistema

> Se sua máquina já tem **Node.js** (e portanto `npm`), pode pular esta seção — é só rodar os
> comandos acima. As instruções abaixo só são necessárias para quem for instalar o **Bun**
> (opcional, mais rápido) ou ainda não tem o Node.js.

**Linux**

```bash
# Node.js (via nvm) — recomendado
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
nvm install --lts

# Bun (opcional, mais rápido)
curl -fsSL https://bun.sh/install | bash
```

Ou use o gerenciador da sua distro (ex.: `sudo apt install nodejs npm` no Debian/Ubuntu).

**macOS**

```bash
# Com Homebrew (https://brew.sh)
brew install node      # Node.js + npm
brew install oven-sh/bun/bun   # Bun (opcional)
```

**Windows**

PowerShell (recomendado usar o [winget](https://learn.microsoft.com/windows/package-manager/)):

```powershell
winget install OpenJS.NodeJS.LTS    # Node.js + npm
powershell -c "irm bun.sh/install.ps1 | iex"   # Bun (opcional)
```

Depois rode os comandos no **PowerShell** ou no **Prompt de Comando** (não precisa de WSL).
Se preferir, o WSL2 também funciona — nesse caso siga as instruções de Linux.

> **Bun ou npm?** O projeto funciona com os dois. O CI usa Bun, mas `npm install` + `npm run dev`
> produzem o mesmo resultado. Use o que já tiver instalado.

O broker e o namespace ficam em `src/providers/MqttProvider.tsx` e `src/lib/mqttTopics.ts`.

## Temas

O app suporta **três temas**, alternáveis pelo seletor segmentado no topo da tela:

| Tema | Paleta |
|---|---|
| Escuro azul (`dark`) | Navy `oklch(0.18 0.04 245)` + ciano `#00B4D8` |
| Escuro verde (`dark-black`) | Grafite `oklch(0.14 0.004 160)` + verde-menta |
| Claro (`light`) | Branco `oklch(0.97 0.008 220)` + ciano |

A preferência é persistida em `localStorage`. O HTML recebe as classes `.dark-black` ou `.light` conforme o tema; ausência de ambas equivale ao tema `dark` (padrão).

## Arquitetura

```
ESP32 ──TLS 8883──► HiveMQ Cloud ◄──WSS 8884── Dashboard (browser)
         aquasense-ibmec-pt/*        MQTT.js + Zod → poolStore → UI
```

- **Broker:** por padrão conecta no **HiveMQ Cloud** (mesmo cluster do firmware com `USAR_TLS 1`). Configurável por env, sem recompilar: `VITE_MQTT_URL`, `VITE_MQTT_USERNAME`, `VITE_MQTT_PASSWORD` (ex.: `VITE_MQTT_URL=wss://broker.hivemq.com:8884` para o broker público).
- **Provider:** `src/providers/MqttProvider.tsx` assina `aquasense-ibmec-pt/#`, valida o payload consolidado `dados` com Zod e empurra cada amostra para o `poolStore` via `ingestFromMqtt()`. Toda a UI lê desse store — nenhum componente faz fetch direto.
- **Comandos enviados:** o dashboard publica `controle/modo` (automático / parada — enviado como `parada` no fio) e `dosagem/comando` (cloro / ácido / base). O firmware responde com `dosagem/evento` e `controle/estado`.
- **Fallback:** se o broker ficar > 15 s sem mensagem, uma simulação local entra automaticamente. Um banner avisa o usuário; quando o MQTT volta, o dashboard retorna aos dados reais sem intervenção.
- **Status MQTT:** `describeMqttStatus()` em `src/lib/mqttStatus.ts` é a fonte única de verdade para o estado de conexão, consumida por todos os componentes.

### Schema do payload `aquasense-ibmec-pt/dados`

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

Valores `-99.0` em campos numéricos sinalizam erro de sensor — a UI mostra `ERRO` no card correspondente. O glossário completo de campos está em `docs/Glossario.md`.

## Controle de aquecimento

O controle automático da bomba acontece **no ESP32** por diferença de temperatura (ΔT):

```
ΔT = T_coletor − T_piscina
ΔT ≥ 5 °C  →  LIGA a bomba
ΔT ≤ 1 °C  →  DESLIGA a bomba
Anti-cycling: intervalo mínimo de 60 s entre mudanças
```

O dashboard exibe o estado atual e o histórico de acionamentos. O operador pode enviar `parada de emergência` ou retornar ao modo `automático` via `controle/modo`.

## Faixas ideais (piscina)

Conforme **ABNT NBR 10818** — mesmas constantes em `src/lib/thresholds.ts`:

| Parâmetro | Faixa ideal |
|---|---|
| pH | 7.2 – 7.6 |
| Cloro livre | 1.0 – 3.0 ppm |
| Alcalinidade | 80 – 120 ppm CaCO₃ |
| Temperatura | 26 – 30 °C |

## Hardware (referência do produto final)

- **ESP32 DevKit V1** (Wi-Fi 2,4 GHz)
- Sensor de pH **E-201-C + módulo PH-4502C**
- **Eletrodo ORP** industrial (proxy de cloro livre)
- Sonda de **condutividade** (proxy de alcalinidade)
- Sensores de temperatura submersos para piscina e coletor solar
- **LCD 20×4 I²C** local
- **Relé opto-isolado** acionando bomba 1CV 220V

> Veja a pinagem completa e as instruções de compilação em `AquaSense/README.md`.

## Testes

Suite de **93 testes** com **Vitest** cobrindo alertas agregados, status MQTT, lógica do store e fluxos integrados end-to-end:

```bash
bun run test           # roda a suite completa
bun run test -- --ui   # abre o Vitest UI no browser
```

O CI (`.github/workflows/ci.yml`) executa `bun run lint`, `bun run test` e `bun run build` em cada push e PR para `main`.

## Deploy

O dashboard é hospedado como site estático no **Cloudflare Pages** (projeto `aquasense-iot`). `npm run build` (ou `bun run build`) gera `dist/client/` já com `index.html` e `_redirects` (ver `scripts/postbuild-spa.mjs`), prontos para qualquer host estático.

Para atualizar o site em produção a partir da branch `main`:

```bash
git checkout main
git pull origin main

cd dashboard-app
npm install              # ou: bun install
npm run build            # ou: bun run build — gera dist/client/

npx wrangler pages deploy dist/client --project-name aquasense-iot --branch main --commit-dirty=true
```

> **`--branch`** define o ambiente no Cloudflare Pages: `main` publica em **produção** (`aquasense-iot.pages.dev`); qualquer outro nome cria um **preview** isolado (`<branch>.aquasense-iot.pages.dev`), útil para testar antes de ir ao ar.
>
> Na primeira execução o Wrangler pede login (`npx wrangler login`).

## Equipe

- **Grupo 1** (controle de aquecimento): Martim Roxo · Vitor Yoshida
- **Grupo 2** (qualidade da água): João Perestrelo · Hikaru · Roan
- **Professor:** Marcel Stefan Wagner, PhD
- **Empresa parceira:** Invivio Tecnologia Ltda.
