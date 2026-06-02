// ============================================================================
//  Configuração da ponte MQTT da skill Alexa do AquaSense IoT.
//
//  Por padrão usa o MESMO broker público do firmware (USAR_TLS 0) e do
//  dashboard. Para um cluster HiveMQ Cloud (TLS), defina as variáveis de
//  ambiente no console Alexa-hosted (ou na sua Lambda):
//
//    MQTT_URL       wss://SEU_CLUSTER.s1.eu.hivemq.cloud:8884/mqtt
//    MQTT_USERNAME  usuario
//    MQTT_PASSWORD  senha
//
//  O namespace deve bater com o do firmware (NS em AquaSense.ino) e com o
//  dashboard (src/lib/mqttTopics.ts).
// ============================================================================

module.exports = {
  MQTT_URL: process.env.MQTT_URL || "wss://broker.hivemq.com:8884/mqtt",
  MQTT_USERNAME: process.env.MQTT_USERNAME || undefined,
  MQTT_PASSWORD: process.env.MQTT_PASSWORD || undefined,
  NAMESPACE: process.env.MQTT_NAMESPACE || "aquasense-ibmec-pt",
  // Margem confortável dentro do timeout de 8 s da Alexa.
  TIMEOUT_MS: parseInt(process.env.MQTT_TIMEOUT_MS || "4500", 10),
};
