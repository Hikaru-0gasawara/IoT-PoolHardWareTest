// Fonte única dos tópicos MQTT do projeto.
//
// FORK PT — namespace mudou de `aquasense-ibmec` (firmware oficial EN) para
// `aquasense-ibmec-pt` (firmware experimental traduzido — main_pt.py).
// Os 2 firmwares podem coexistir no mesmo broker porque vivem em namespaces
// distintos; este dashboard só fala PT.
//
// Por que existir: typo em qualquer string "aquasense-ibmec-pt/..." espalhada
// pelos componentes seria invisível pro TypeScript e silenciosamente
// ignorado em runtime. Centralizar elimina essa classe inteira de bug.

export const MQTT_NAMESPACE = "aquasense-ibmec-pt" as const;

export const MQTT_TOPICS = {
  // Wildcard usado na assinatura — captura tudo abaixo do namespace.
  ALL: `${MQTT_NAMESPACE}/#`,

  // Payload consolidado que o dashboard parseia (fonte de verdade da UI).
  // Renomeado: aquasense-ibmec/data → aquasense-ibmec-pt/dados
  DATA: `${MQTT_NAMESPACE}/dados`,

  // Tópicos granulares publicados pelo firmware (informativos no log).
  // Renomeados: pool/* → piscina/*, solar/* → coletor/*, system/* → sistema/*
  POOL_PH: `${MQTT_NAMESPACE}/piscina/ph`,
  POOL_CHLORINE: `${MQTT_NAMESPACE}/piscina/cloro`,
  POOL_ALKALINITY: `${MQTT_NAMESPACE}/piscina/alcalinidade`,
  POOL_TEMPERATURE: `${MQTT_NAMESPACE}/piscina/temperatura`,
  SOLAR_TEMPERATURE: `${MQTT_NAMESPACE}/coletor/temperatura`,
  SOLAR_PUMP: `${MQTT_NAMESPACE}/coletor/bomba`,
  SYSTEM_ALERTS: `${MQTT_NAMESPACE}/sistema/alertas`,
  SYSTEM_STATUS: `${MQTT_NAMESPACE}/sistema/status`,

  // Telemetria técnica do firmware (60s). Renomeado: system/health → sistema/saude
  SYSTEM_HEALTH: `${MQTT_NAMESPACE}/sistema/saude`,

  // Eventos das 3 dosadoras peristálticas (iniciada/concluida/bloqueada).
  // Fork PT inclui novo campo `fonte` ("automatico" | "manual") em eventos
  // bloqueada/iniciada para auditoria da origem do comando.
  DOSING_EVENT: `${MQTT_NAMESPACE}/dosagem/evento`,

  // Estado do controle (modo / E-Stop / dose em andamento) com retain=true,
  // chega imediato após subscribe. Renomeado: control/state → controle/estado
  CONTROL_STATE: `${MQTT_NAMESPACE}/controle/estado`,
} as const;

export type MqttTopic = typeof MQTT_TOPICS[keyof typeof MQTT_TOPICS];

// Tópicos que o DASHBOARD publica (firmware consome).
// Renomeados: control/mode → controle/modo, dosing/command → dosagem/comando
export const TOPIC_CONTROL_MODE = `${MQTT_NAMESPACE}/controle/modo` as const;
export const TOPIC_DOSING_COMMAND = `${MQTT_NAMESPACE}/dosagem/comando` as const;

// Lista exibida no SettingsPanel — ordem reflete o que o firmware publica
// hoje em main_pt.py.
export const PUBLISHED_TOPICS: readonly MqttTopic[] = [
  MQTT_TOPICS.POOL_PH,
  MQTT_TOPICS.POOL_CHLORINE,
  MQTT_TOPICS.POOL_ALKALINITY,
  MQTT_TOPICS.POOL_TEMPERATURE,
  MQTT_TOPICS.SOLAR_TEMPERATURE,
  MQTT_TOPICS.SOLAR_PUMP,
  MQTT_TOPICS.SYSTEM_ALERTS,
  MQTT_TOPICS.SYSTEM_HEALTH,
  MQTT_TOPICS.CONTROL_STATE,
  MQTT_TOPICS.DOSING_EVENT,
  MQTT_TOPICS.DATA,
] as const;
