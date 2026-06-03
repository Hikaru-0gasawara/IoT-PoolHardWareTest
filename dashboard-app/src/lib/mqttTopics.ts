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

export type MqttTopic = typeof MQTT_TOPICS[keyof typeof MQTT_TOPICS];

// Tópicos que o DASHBOARD publica (firmware consome via subscribe).
// dosagem/comando JSON: { parametro, origem, comando_id }
// controle/modo   JSON: { modo }
export const TOPIC_DOSING_COMMAND = `${MQTT_NAMESPACE}/dosagem/comando` as const;
export const TOPIC_CONTROL_MODE = `${MQTT_NAMESPACE}/controle/modo` as const;

// Lista exibida no SettingsPanel — ordem reflete o que o firmware publica.
export const PUBLISHED_TOPICS: readonly MqttTopic[] = [
  MQTT_TOPICS.PISCINA_PH,
  MQTT_TOPICS.PISCINA_CLORO,
  MQTT_TOPICS.PISCINA_ALCALINIDADE,
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
