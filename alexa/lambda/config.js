// ============================================================================
//  Configuração da ponte MQTT da skill Alexa do AquaSense IoT.
//
//  Os defaults abaixo apontam para o MESMO cluster HiveMQ Cloud (TLS) usado
//  pelo firmware quando `USAR_TLS 1` (PADRAO em AquaSense.ino — ver
//  MQTT_HOST/MQTT_USER/MQTT_PASS) — mesmas credenciais já versionadas no
//  firmware (cluster de uso da disciplina, sem dados sensíveis de produção).
//  Antes (default = broker.hivemq.com público) o "out of the box" da skill
//  ficava em um broker DIFERENTE do firmware com `USAR_TLS 1` (o padrão), e a
//  skill nunca encontrava o dispositivo.
//
//  Para usar OUTRO cluster HiveMQ Cloud (ex.: `USAR_TLS 0` / broker público,
//  ou um cluster próprio), defina as variáveis de ambiente no console
//  Alexa-hosted (ou na sua Lambda):
//
//    MQTT_URL       wss://SEU_CLUSTER.s1.eu.hivemq.cloud:8884/mqtt (ou
//                   wss://broker.hivemq.com:8884/mqtt para o broker público)
//    MQTT_USERNAME  usuario (vazio/omitido para o broker público)
//    MQTT_PASSWORD  senha   (vazio/omitido para o broker público)
//
//  O namespace deve bater com o do firmware (NS em AquaSense.ino) e com o
//  dashboard (src/lib/mqttTopics.ts).
// ============================================================================

module.exports = {
  MQTT_URL:
    process.env.MQTT_URL || "wss://5b98faa6560246759f3065ffc720f8b9.s1.eu.hivemq.cloud:8884/mqtt",
  MQTT_USERNAME: process.env.MQTT_USERNAME || "ProjetoIoT",
  MQTT_PASSWORD: process.env.MQTT_PASSWORD || "IoT12345678",
  NAMESPACE: process.env.MQTT_NAMESPACE || "aquasense-ibmec-pt",
  // Margem confortável dentro do timeout de 8 s da Alexa.
  TIMEOUT_MS: parseInt(process.env.MQTT_TIMEOUT_MS || "4500", 10),
};
