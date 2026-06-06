// Fonte única dos tópicos MQTT do projeto.
//
// Alinhado ao firmware ESP32 AquaSense v3.0 (protocolo PT — Arduino/PubSubClient).
// Namespace: `aquasense-ibmec-pt`. O firmware publica um payload consolidado
// (retain) em `.../dados`, leituras granulares informativas, telemetria de
// saúde, estado de controle e eventos de dosagem em `.../dosagem/evento`.
//
// Por que existir: typo em qualquer string "aquasense-ibmec-pt/..." espalhada
// pelos componentes seria invisível pro TypeScript e silenciosamente
// ignorado em runtime. Centralizar elimina essa classe inteira de bug.

export const MQTT_NAMESPACE = "aquasense-ibmec-pt" as const;

export const MQTT_TOPICS = {
  // Wildcard usado na assinatura — captura tudo abaixo do namespace.
  ALL: `${MQTT_NAMESPACE}/#`,

  // Payload consolidado (retain=true) — fonte de verdade da UI.
  // JSON flat: { projeto, ciclo, ph, orp_mv, cloro, alcalinidade,
  //   condutividade_us_cm, temp_piscina, temp_coletor, delta_t, umidade,
  //   bomba, alertas, modo, parada_emergencia, dose_em_andamento }
  DADOS: `${MQTT_NAMESPACE}/dados`,

  // Leituras individuais (floats/strings) — informativas no log.
  PISCINA_PH: `${MQTT_NAMESPACE}/piscina/ph`,
  PISCINA_CLORO: `${MQTT_NAMESPACE}/piscina/cloro`,
  PISCINA_ALCALINIDADE: `${MQTT_NAMESPACE}/piscina/alcalinidade`,
  // Leitura granular de condutividade (firmware v3.1). Informativa no log;
  // o valor de verdade da UI vem de `condutividade_us_cm` em `.../dados`.
  PISCINA_CONDUTIVIDADE: `${MQTT_NAMESPACE}/piscina/condutividade`,
  PISCINA_TEMP: `${MQTT_NAMESPACE}/piscina/temperatura`,
  COLETOR_TEMP: `${MQTT_NAMESPACE}/coletor/temperatura`,
  COLETOR_BOMBA: `${MQTT_NAMESPACE}/coletor/bomba`,
  SISTEMA_ALERTAS: `${MQTT_NAMESPACE}/sistema/alertas`,
  SISTEMA_STATUS: `${MQTT_NAMESPACE}/sistema/status`,
  SISTEMA_SAUDE: `${MQTT_NAMESPACE}/sistema/saude`,
  CONTROLE_ESTADO: `${MQTT_NAMESPACE}/controle/estado`,

  // Evento do firmware após um comando de dosagem.
  // JSON: { parametro, evento, motivo?, fonte }
  DOSAGEM_EVENTO: `${MQTT_NAMESPACE}/dosagem/evento`,
} as const;

export type MqttTopic = (typeof MQTT_TOPICS)[keyof typeof MQTT_TOPICS];

// Tópicos que o DASHBOARD publica (firmware consome via subscribe).
// dosagem/comando      JSON: { parametro, origem, comando_id }
// controle/modo        JSON: { modo }  — modo da BOMBA de aquecimento solar
// controle/dosagem/modo JSON: { modo } — modo da DOSAGEM química (independente)
export const TOPIC_DOSING_COMMAND = `${MQTT_NAMESPACE}/dosagem/comando` as const;
export const TOPIC_CONTROL_MODE = `${MQTT_NAMESPACE}/controle/modo` as const;
export const TOPIC_DOSING_MODE = `${MQTT_NAMESPACE}/controle/dosagem/modo` as const;

// ─────────────────────────────────────────────────────────────────────
// Vocabulário de modo no fio MQTT.
// A UI usa "parado" internamente (PumpMode), mas o FIRMWARE espera "parada".
// Estes mapeadores traduzem na fronteira de publish (UI→firmware) e de
// ingest (firmware→UI). Sem isto, o comando de parar/E-Stop do dashboard
// é descartado em silêncio pelo firmware ("parado" ≠ "parada").
// ─────────────────────────────────────────────────────────────────────
export type FirmwareMode = "automatico" | "manual" | "parada";

export function toFirmwareMode(m: "automatico" | "manual" | "parado"): FirmwareMode {
  return m === "parado" ? "parada" : m;
}

export function fromFirmwareMode(m: string): "automatico" | "manual" | "parado" {
  if (m === "parada" || m === "parado") return "parado";
  if (m === "manual") return "manual";
  return "automatico";
}

// Lista exibida no SettingsPanel — ordem reflete o que o firmware publica.
export const PUBLISHED_TOPICS: readonly MqttTopic[] = [
  MQTT_TOPICS.PISCINA_PH,
  MQTT_TOPICS.PISCINA_CLORO,
  MQTT_TOPICS.PISCINA_ALCALINIDADE,
  MQTT_TOPICS.PISCINA_CONDUTIVIDADE,
  MQTT_TOPICS.PISCINA_TEMP,
  MQTT_TOPICS.COLETOR_TEMP,
  MQTT_TOPICS.COLETOR_BOMBA,
  MQTT_TOPICS.SISTEMA_ALERTAS,
  MQTT_TOPICS.SISTEMA_STATUS,
  MQTT_TOPICS.SISTEMA_SAUDE,
  MQTT_TOPICS.CONTROLE_ESTADO,
  MQTT_TOPICS.DADOS,
  MQTT_TOPICS.DOSAGEM_EVENTO,
] as const;

// ─────────────────────────────────────────────────────────────────────
// Mapeamento exato comando/telemetria → tópico MQTT.
//
// Fonte única de verdade para a documentação exibida no painel de
// Diagnóstico (Controle avançado). Cada controle/leitura aponta para:
//   - o tópico MQTT efetivamente usado,
//   - a direção (comando = dashboard→firmware, telemetria = firmware→dashboard),
//   - o campo do payload consolidado `.../dados` quando a UI lê de lá,
//   - o tópico granular informativo equivalente (quando existe).
//
// IMPORTANTE: a UI consome SEMPRE o payload consolidado em `.../dados`
// (campo `field`). Os tópicos granulares são publicados pelo firmware
// apenas para inspeção no Log MQTT — não alimentam o estado.
// ─────────────────────────────────────────────────────────────────────

export type TopicDirection = "comando" | "telemetria";

export interface TopicMapEntry {
  /** Chave estável (casa com os ids de sensor do diagnóstico quando aplicável). */
  id: string;
  /** Nome amigável do controle/leitura. */
  label: string;
  /** Tópico MQTT efetivo do comando/telemetria. */
  topic:
    | MqttTopic
    | typeof TOPIC_DOSING_COMMAND
    | typeof TOPIC_CONTROL_MODE
    | typeof TOPIC_DOSING_MODE;
  /** Direção do fluxo. */
  direction: TopicDirection;
  /** Campo lido no payload consolidado `.../dados`, quando a UI usa ele. */
  field?: string;
  /** Tópico granular equivalente publicado pelo firmware (informativo). */
  granular?: MqttTopic;
  /** Exemplo/descrição do payload. */
  payload: string;
}

// Comandos publicados pelo dashboard (controles).
export const COMMAND_TOPIC_MAP: readonly TopicMapEntry[] = [
  {
    id: "dose-cloro",
    label: "Dose de Cloro",
    topic: TOPIC_DOSING_COMMAND,
    direction: "comando",
    payload: `{ parametro: "cloro", origem: "manual", comando_id }`,
  },
  {
    id: "dose-acido",
    label: "Dose de Ácido (pH−)",
    topic: TOPIC_DOSING_COMMAND,
    direction: "comando",
    payload: `{ parametro: "acido", origem: "manual", comando_id }`,
  },
  {
    id: "dose-base",
    label: "Dose de Base (pH+)",
    topic: TOPIC_DOSING_COMMAND,
    direction: "comando",
    payload: `{ parametro: "base", origem: "manual", comando_id }`,
  },
  {
    id: "modo-aquecimento",
    label: "Modo da bomba de aquecimento",
    topic: TOPIC_CONTROL_MODE,
    direction: "comando",
    payload: `{ modo: "automatico" | "parado" } (fio: "parado"→"parada")`,
  },
  {
    id: "modo-dosagem",
    label: "Modo da dosagem química",
    topic: TOPIC_DOSING_MODE,
    direction: "comando",
    payload: `{ modo: "automatico" | "manual" }`,
  },
] as const;

// Telemetria recebida do firmware (leituras do diagnóstico).
export const TELEMETRY_TOPIC_MAP: readonly TopicMapEntry[] = [
  {
    id: "ph",
    label: "pH",
    topic: MQTT_TOPICS.DADOS,
    direction: "telemetria",
    field: "ph",
    granular: MQTT_TOPICS.PISCINA_PH,
    payload: "dados.ph (float; -99 = erro de sensor)",
  },
  {
    id: "cloro",
    label: "Cloro",
    topic: MQTT_TOPICS.DADOS,
    direction: "telemetria",
    field: "cloro",
    granular: MQTT_TOPICS.PISCINA_CLORO,
    payload: "dados.cloro (ppm; -99 = erro de sensor)",
  },
  {
    id: "alcalinidade",
    label: "Alcalinidade",
    topic: MQTT_TOPICS.DADOS,
    direction: "telemetria",
    field: "alcalinidade",
    granular: MQTT_TOPICS.PISCINA_ALCALINIDADE,
    payload: "dados.alcalinidade (ppm; -99 = erro de sensor)",
  },
  {
    id: "piscina",
    label: "Temp. piscina",
    topic: MQTT_TOPICS.DADOS,
    direction: "telemetria",
    field: "temp_piscina",
    granular: MQTT_TOPICS.PISCINA_TEMP,
    payload: "dados.temp_piscina (°C; -99 = erro de sensor)",
  },
  {
    id: "coletor",
    label: "Temp. coletor",
    topic: MQTT_TOPICS.DADOS,
    direction: "telemetria",
    field: "temp_coletor",
    granular: MQTT_TOPICS.COLETOR_TEMP,
    payload: "dados.temp_coletor (°C; -99 = erro de sensor)",
  },
  {
    id: "delta_t",
    label: "ΔT",
    topic: MQTT_TOPICS.DADOS,
    direction: "telemetria",
    field: "delta_t",
    payload: "dados.delta_t (°C; derivado coletor − piscina)",
  },
  {
    id: "bomba",
    label: "Estado da bomba",
    topic: MQTT_TOPICS.DADOS,
    direction: "telemetria",
    field: "bomba",
    granular: MQTT_TOPICS.COLETOR_BOMBA,
    payload: 'dados.bomba ("LIGADA" | "DESLIGADA")',
  },
  {
    id: "alertas",
    label: "Alertas",
    topic: MQTT_TOPICS.DADOS,
    direction: "telemetria",
    field: "alertas",
    granular: MQTT_TOPICS.SISTEMA_ALERTAS,
    payload: "dados.alertas (string[])",
  },
  {
    id: "ciclo",
    label: "Ciclo",
    topic: MQTT_TOPICS.DADOS,
    direction: "telemetria",
    field: "ciclo",
    granular: MQTT_TOPICS.SISTEMA_SAUDE,
    payload: "dados.ciclo (contador sequencial; detecta gaps)",
  },
  {
    id: "dosagem-evento",
    label: "Evento de dosagem",
    topic: MQTT_TOPICS.DOSAGEM_EVENTO,
    direction: "telemetria",
    payload: "{ parametro, evento, motivo?, fonte }",
  },
] as const;

// Mapeamento completo (comandos + telemetria) para consumo na UI.
export const TOPIC_MAP: readonly TopicMapEntry[] = [
  ...COMMAND_TOPIC_MAP,
  ...TELEMETRY_TOPIC_MAP,
] as const;
