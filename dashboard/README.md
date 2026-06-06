# dashboard/ — Dashboard single-file (sem build)

Dashboard MQTT de **arquivo único** (`index.html`), sem build nem dependências locais — abre direto no navegador. Útil para um teste rápido da telemetria sem subir o app React.

## Como usar

1. Abra `dashboard/index.html` no navegador (duplo-clique ou arraste para uma aba). Precisa de **internet**: carrega o MQTT.js de um CDN e conecta no broker via `wss://`.
2. Clique em **Conectar** — as credenciais do HiveMQ Cloud já vêm preenchidas.
3. Os cards (pH, ORP, condutividade, temperaturas, ΔT, bomba) e o **Log MQTT** atualizam em tempo real quando o ESP32 publica.
4. **Configurar** abre um modal para trocar host, porta, usuário, senha e o **prefixo de tópicos** (persistido no `localStorage`).

## ⚠️ Namespace antigo

Este dashboard escuta o namespace **`aquasense-ibmec`**, com tópicos granulares por sensor
(`aquasense-ibmec/agua/ph`, `.../temperatura/piscina`, …) — **diferente** do firmware e do
`dashboard-app/` atuais, que usam `aquasense-ibmec-pt` com payload consolidado `dados`.

Se nenhum dado aparecer, ajuste o prefixo em **Configurar** para o que o seu firmware publica,
ou use o **`dashboard-app/`** (cliente oficial, alinhado ao firmware v3.0).

## Identidade visual

Paleta **navy + ciano `#00B4D8`** (a mesma do app). Stack mínima: HTML/CSS/JS puro + MQTT.js via CDN — nada de framework ou etapa de build.

> Para o cliente completo (temas, gráficos, alertas agregados, comandos), veja [`../dashboard-app/`](../dashboard-app/README.md).
