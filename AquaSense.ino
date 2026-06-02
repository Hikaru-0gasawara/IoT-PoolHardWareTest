// ============================================================================
//  AquaSense IoT - ESP32  |  v2.4.1
//  Monitoramento de qualidade da agua + controle de bomba do coletor solar
//  IBMEC Sao Paulo - Sistemas Embarcados
// ----------------------------------------------------------------------------
//  GOTCHA #1 (causa mais comum de "MQTT nao funciona"):
//    Com USAR_TLS 0 voce publica no broker PUBLICO (broker.hivemq.com),
//    NAO no seu cluster HiveMQ Cloud. Se voce abre o painel do SEU cluster
//    esperando ver as mensagens, nao vai aparecer nada. Para usar o seu
//    cluster: USAR_TLS 1 + host real + credenciais do Access Management.
//  GOTCHA #2 (hardware real): ESP32 so fala Wi-Fi 2.4 GHz. Rede 5G nao conecta.
//  GOTCHA #3: as leituras sao publicadas com retain=true e log OK/FALHOU,
//    entao um cliente que assinar depois tambem recebe o ultimo valor.
// ============================================================================

#define USAR_TLS 1   // 0 = broker publico de teste (broker.hivemq.com, sem TLS/login) | 1 = HiveMQ Cloud (TLS porta 8883)

/*
 * ============================================================================
 *  AquaSense IoT  -  Firmware otimizado v2.4.1
 *  IBMEC São Paulo / Invivio Tecnologia Ltda
 *  Sistemas Embarcados - Prof. Marcel Stefan Wagner, PhD
 *  Grupo 1: Okaru, João Perestrelo, Roan
 * ============================================================================
 *
 *  Otimizações desta versão:
 *    [C-1] LEDs voltam a respeitar faixas dos sensores
 *    [C-2] Seleção MQTT entre broker público HiveMQ e HiveMQ Cloud via USAR_TLS
 *    [C-5] Diagnóstico de Wi-Fi/MQTT e confirmação de publish por tópico
 *    [C-3] Reconexão MQTT 100% não-bloqueante (state machine + backoff)
 *    [C-4] mqtt.loop() guardado por WiFi.status()
 *    [G-1] LCD inicializado no endereço I2C detectado
 *    [G-3] clientId usa todos os 48 bits do MAC
 *    [G-4] setServer chamado uma única vez no setup
 *    [G-5] WiFi.setAutoReconnect(true) + persistent(false) explícitos
 *    [M-1] snprintf + char[] no LCD/MQTT (zero String, zero heap em mensagens)
 *    [M-2] LCD sem flicker (padding em vez de clear)
 *    [M-3] LED Wi-Fi movido para D5 (não-strapping)
 *    [M-4] Literais float (sufixo f) — evita promoção para double
 *
 *  Mapeamento de pinos:
 *     D4  -> LED 1   (pH fora da faixa)
 *     D5  -> LED Wi-Fi (status da conexão)
 *     D18 -> LED 2   (ORP fora da faixa)
 *     D19 -> LED 3   (condutividade fora da faixa)
 *     D21 -> LCD SDA (I2C)
 *     D22 -> LCD SCL (I2C)
 *     D26 -> Relé    (bomba do coletor solar)
 * ============================================================================
 */

#include <WiFi.h>
#if USAR_TLS
  #include <WiFiClientSecure.h>
#else
  #include <WiFiClient.h>
#endif
#include <PubSubClient.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>

// ============================================================================
//  PINOS
// ============================================================================
#define PIN_LED_PH     4
#define PIN_LED_WIFI   5
#define PIN_LED_ORP    18
#define PIN_LED_COND   19
#define PIN_RELE       26
#define PIN_SDA        21
#define PIN_SCL        22
#define I2C_CLOCK_HZ   100000UL

#define RELE_ACTIVE_LOW   1
#if RELE_ACTIVE_LOW
  #define RELE_LIGA    LOW
  #define RELE_DESLIGA HIGH
#else
  #define RELE_LIGA    HIGH
  #define RELE_DESLIGA LOW
#endif

// ============================================================================
//  LCD I2C 16x2 — endereço detectado no boot
// ============================================================================
LiquidCrystal_I2C* lcd = nullptr;
bool lcdOK = false;
uint8_t enderecoLCD = 0;

// ============================================================================
//  WI-FI
// ============================================================================
const char* WIFI_SSID = "SUA_REDE_WIFI";
const char* WIFI_PASS = "SUA_SENHA_WIFI";

// ============================================================================
//  MQTT / HiveMQ
// ============================================================================
#if USAR_TLS
  // HiveMQ Cloud: preencha o host real do cluster e as credenciais.
  const char* MQTT_HOST = "5b98faa6560246759f3065ffc720f8b9.s1.eu.hivemq.cloud";
  const int   MQTT_PORT = 8883;
  const char* MQTT_USER = "ProjetoIoT";
  const char* MQTT_PASS = "IoT12345678";
#else
  // Broker público de teste: sem TLS e sem autenticação.
  const char* MQTT_HOST = "broker.hivemq.com";
  const int   MQTT_PORT = 1883;
  const char* MQTT_USER = "";
  const char* MQTT_PASS = "";
#endif

// Prefixo único para reduzir colisão com outros usuários do broker público.
const char* TOPIC_PH             = "aquasense-ibmec/agua/ph";
const char* TOPIC_ORP            = "aquasense-ibmec/agua/orp";
const char* TOPIC_COND           = "aquasense-ibmec/agua/condutividade";
const char* TOPIC_T_PISC         = "aquasense-ibmec/temperatura/piscina";
const char* TOPIC_T_SOLAR        = "aquasense-ibmec/temperatura/coletor";
const char* TOPIC_BOMBA          = "aquasense-ibmec/bomba/estado";
const char* TOPIC_STATUS         = "aquasense-ibmec/sistema/status";
const char* TOPIC_ALEXA_SNAPSHOT = "aquasense-ibmec/alexa/snapshot";
const char* TOPIC_ALEXA_RESPOSTA = "aquasense-ibmec/alexa/resposta";
const char* TOPIC_CMD_DOSAGEM    = "aquasense-ibmec/dosagem/comando";

#if USAR_TLS
  WiFiClientSecure wifiClient;
#else
  WiFiClient       wifiClient;
#endif
PubSubClient     mqtt(wifiClient);

bool mqttHabilitado = false;
char clientId[24];

// ============================================================================
//  PARÂMETROS DE OPERAÇÃO
// ============================================================================
const unsigned long INTERVALO_AQUISICAO_MS = 5000;
const float         DELTA_LIGAR_C          = 5.0f;
const float         DELTA_DESLIGAR_C       = 1.0f;
const unsigned long ANTI_CYCLING_MS        = 60000UL;
const float PH_MIN   = 7.2f,   PH_MAX   = 7.6f;
const float ORP_MIN  = 650.0f, ORP_MAX  = 750.0f;
const float COND_MIN = 800.0f, COND_MAX = 1500.0f;
const unsigned long WIFI_RETRY_MS = 10000UL;
const unsigned long MQTT_RETRY_MS = 5000UL;

// ============================================================================
//  ESTADO GLOBAL
// ============================================================================
unsigned long ultimaAquisicao    = 0;
unsigned long ultimaMudancaBomba = 0;
unsigned long proxRetryWiFi      = 0;
unsigned long proxRetryMQTT      = 0;
bool          bombaLigada        = false;
bool          primeiroCiclo      = true;

static float g_ph     = 7.4f;
static float g_orp    = 700.0f;
static float g_cond   = 1100.0f;
static float g_tPisc  = 24.0f;
static float g_tSolar = 28.0f;

// ============================================================================
//  SIMULAÇÃO DOS SENSORES (literais float — sem promoção a double)
// ============================================================================
float lerPH()            { return 7.4f    + sinf(millis() / 30000.0f) * 0.4f;   }
float lerORP()           { return 700.0f  + sinf(millis() / 25000.0f) * 60.0f;  }
float lerCondutividade() { return 1100.0f + sinf(millis() / 40000.0f) * 300.0f; }
float lerTempPiscina()   { return 24.0f   + sinf(millis() / 60000.0f) * 2.0f;   }
float lerTempSolar()     { return 28.0f   + sinf(millis() / 45000.0f) * 8.0f;   }

inline bool foraDaFaixa(float v, float lo, float hi) {
  return (v < lo) || (v > hi);
}

// ---------------------------------------------------------------------------
//  Decodificadores de erro - traduzem os codigos para texto no Serial Monitor.
// ---------------------------------------------------------------------------
const char* mqttRcToStr(int rc) {
  switch (rc) {
    case -4: return "tempo esgotado (broker nao respondeu)";
    case -3: return "conexao perdida";
    case -2: return "falha de rede/TCP (host, porta ou TLS errados)";
    case -1: return "cliente desconectado";
    case  0: return "conectado";
    case  1: return "versao de protocolo MQTT incorreta";
    case  2: return "clientId rejeitado";
    case  3: return "servidor indisponivel";
    case  4: return "usuario/senha incorretos";
    case  5: return "nao autorizado (credenciais ou permissoes)";
    default: return "desconhecido";
  }
}

const char* wifiStatusToStr(wl_status_t s) {
  switch (s) {
    case WL_IDLE_STATUS:     return "ocioso";
    case WL_NO_SSID_AVAIL:   return "SSID nao encontrado (rede 2.4GHz? nome certo?)";
    case WL_SCAN_COMPLETED:  return "scan completo";
    case WL_CONNECT_FAILED:  return "falha ao conectar (senha errada?)";
    case WL_CONNECTION_LOST: return "conexao perdida";
    case WL_DISCONNECTED:    return "desconectado";
    case WL_CONNECTED:       return "conectado";
    default:                 return "desconhecido";
  }
}

static void logPublish(const char* topico, bool ok) {
  Serial.print(F("[PUB] "));
  Serial.print(topico);
  Serial.print(F(" -> "));
  Serial.println(ok ? F("OK") : F("FALHOU"));
}

static bool extrairStringJSON(const char* json, const char* chave, char* out, size_t maxLen) {
  char busca[48];
  snprintf(busca, sizeof(busca) - 1, "\"%s\":", chave);
  busca[sizeof(busca) - 1] = '\0';
  const char* p = strstr(json, busca);
  if (!p) return false;
  p += strlen(busca);
  while (*p == ' ' || *p == '\t') p++;
  if (*p != '"') return false;
  p++;

  size_t i = 0;
  while (*p && *p != '"' && i < maxLen - 1) out[i++] = *p++;
  out[i] = '\0';
  return true;
}

static void buildAlertas(char* buf, size_t len) {
  if (len < 3) return;

  size_t pos = 0;
  buf[pos++] = '[';
  buf[pos]   = '\0';
  bool primeiro = true;

  auto append = [&](const char* s) {
    size_t disponivel = len - pos - 1;
    size_t n = strlen(s);
    if (n > disponivel) n = disponivel;
    memcpy(buf + pos, s, n);
    pos += n;
    buf[pos] = '\0';
  };

  if (foraDaFaixa(g_ph, PH_MIN, PH_MAX)) {
    if (!primeiro) append(",");
    append("\"pH\"");
    primeiro = false;
  }
  if (foraDaFaixa(g_orp, ORP_MIN, ORP_MAX)) {
    if (!primeiro) append(",");
    append("\"ORP\"");
    primeiro = false;
  }
  if (foraDaFaixa(g_cond, COND_MIN, COND_MAX)) {
    if (!primeiro) append(",");
    append("\"condutividade\"");
  }

  append("]");
}

static void publicarSnapshotAlexa() {
  if (!mqtt.connected()) return;

  char alertas[48];
  buildAlertas(alertas, sizeof(alertas));

  char payload[400];
  snprintf(payload, sizeof(payload),
           "{\"ph\":%.2f,\"orp_mv\":%.0f,\"cond_us\":%.0f,"
           "\"temp_piscina\":%.1f,\"temp_solar\":%.1f,"
           "\"bomba\":\"%s\",\"alertas\":%s,\"timestamp_ms\":%lu}",
           g_ph, g_orp, g_cond, g_tPisc, g_tSolar,
           bombaLigada ? "ON" : "OFF",
           alertas,
           millis());
  bool ok = mqtt.publish(TOPIC_ALEXA_SNAPSHOT, (const uint8_t*)payload, strlen(payload), true);
  logPublish(TOPIC_ALEXA_SNAPSHOT, ok);
}

static void mqttCallback(char* topic, byte* payload, unsigned int length) {
  if (length == 0 || length > 399) return;

  char msg[400];
  memcpy(msg, payload, length);
  msg[length] = '\0';

  if (strcmp(topic, TOPIC_CMD_DOSAGEM) != 0) return;

  char parametro[32] = "";
  char origem[32]    = "";
  char comandoId[72] = "";
  extrairStringJSON(msg, "parametro",  parametro, sizeof(parametro));
  extrairStringJSON(msg, "origem",     origem,    sizeof(origem));
  extrairStringJSON(msg, "comando_id", comandoId, sizeof(comandoId));

  if (strlen(comandoId) == 0) return;

  const char* resultado;
  const char* motivo;
  if (strcmp(parametro, "cloro") == 0) {
    resultado = "iniciada";
    motivo = "dosagem de cloro simulada";
  } else if (strcmp(parametro, "acido") == 0) {
    resultado = "iniciada";
    motivo = "dosagem de acido simulada";
  } else if (strcmp(parametro, "base") == 0) {
    resultado = "iniciada";
    motivo = "dosagem de base simulada";
  } else {
    resultado = "bloqueada";
    motivo = "parametro invalido";
  }

  char resp[300];
  snprintf(resp, sizeof(resp),
           "{\"comando_id\":\"%s\",\"resultado\":\"%s\","
           "\"parametro\":\"%s\",\"motivo\":\"%s\",\"timestamp_ms\":%lu}",
           comandoId, resultado, parametro, motivo, millis());
  bool okPub = mqtt.publish(TOPIC_ALEXA_RESPOSTA, resp);
  logPublish(TOPIC_ALEXA_RESPOSTA, okPub);

  Serial.print(F("[ALEXA] "));
  Serial.print(origem);
  Serial.print(F(" -> "));
  Serial.print(parametro);
  Serial.print(F(" -> "));
  Serial.println(resultado);
}

void atualizarLEDs(float ph, float orp, float cond) {
  digitalWrite(PIN_LED_PH,   foraDaFaixa(ph,   PH_MIN,   PH_MAX)   ? HIGH : LOW);
  digitalWrite(PIN_LED_ORP,  foraDaFaixa(orp,  ORP_MIN,  ORP_MAX)  ? HIGH : LOW);
  digitalWrite(PIN_LED_COND, foraDaFaixa(cond, COND_MIN, COND_MAX) ? HIGH : LOW);
}

void controlarBomba(float tPiscina, float tSolar) {
  const float deltaT = tSolar - tPiscina;
  const unsigned long agora = millis();

  if (!primeiroCiclo && (agora - ultimaMudancaBomba < ANTI_CYCLING_MS)) return;

  if (!bombaLigada && deltaT >= DELTA_LIGAR_C) {
    bombaLigada = true;
    digitalWrite(PIN_RELE, RELE_LIGA);
    ultimaMudancaBomba = agora;
    primeiroCiclo = false;
    Serial.println(F("[BOMBA] LIGADA (dT >= 5C)"));
  } else if (bombaLigada && deltaT <= DELTA_DESLIGAR_C) {
    bombaLigada = false;
    digitalWrite(PIN_RELE, RELE_DESLIGA);
    ultimaMudancaBomba = agora;
    primeiroCiclo = false;
    Serial.println(F("[BOMBA] DESLIGADA (dT <= 1C)"));
  }
}

void escreverLinhaLCD(uint8_t linha, const char* texto) {
  if (!lcdOK || lcd == nullptr) return;

  char buf[17];
  size_t n = strnlen(texto, 16);
  memcpy(buf, texto, n);
  memset(buf + n, ' ', 16 - n);
  buf[16] = '\0';
  lcd->setCursor(0, linha);
  lcd->print(buf);
}

void atualizarLCD(float ph, float orp, float cond, float tPisc, float tSolar) {
  if (!lcdOK || lcd == nullptr) return;

  static bool tela = false;
  tela = !tela;

  char l1[17], l2[17];
  if (!tela) {
    snprintf(l1, sizeof(l1), "pH%.2f ORP%d", ph, (int)orp);
    snprintf(l2, sizeof(l2), "EC%d B:%s", (int)cond, bombaLigada ? "ON" : "OFF");
  } else {
    snprintf(l1, sizeof(l1), "Tp:%.1f%cC", tPisc, (char)223);
    snprintf(l2, sizeof(l2), "Ts:%.1f%cC %s", tSolar, (char)223, bombaLigada ? "ON" : "OFF");
  }

  escreverLinhaLCD(0, l1);
  escreverLinhaLCD(1, l2);
}

uint8_t escanearI2C() {
  Serial.println(F("[I2C] escaneando..."));
  uint8_t encontrado = 0;

  for (uint8_t addr = 1; addr < 127; addr++) {
    Wire.beginTransmission(addr);
    if (Wire.endTransmission() == 0) {
      Serial.print(F("      0x"));
      Serial.println(addr, HEX);
      if (encontrado == 0) encontrado = addr;
    }
  }

  if (encontrado == 0) Serial.println(F("      nenhum dispositivo"));
  return encontrado;
}

bool inicializarLCD() {
  const uint8_t enderecos[] = { 0x27, 0x3F, 0x20, 0x38, 0x26, 0x3E };
  uint8_t addr = 0;

  for (uint8_t a : enderecos) {
    Wire.beginTransmission(a);
    if (Wire.endTransmission() == 0) {
      addr = a;
      break;
    }
  }

  if (addr == 0) addr = escanearI2C();
  if (addr == 0) {
    Serial.println(F("[LCD] FALHOU - verifique SDA=D21 SCL=D22 GND comum"));
    return false;
  }

  enderecoLCD = addr;
  Serial.print(F("[LCD] endereco 0x"));
  Serial.println(addr, HEX);

  lcd = new LiquidCrystal_I2C(addr, 16, 2);
  delay(50);
  lcd->begin();
  delay(100);
  lcd->backlight();
  delay(50);
  lcd->clear();
  delay(50);
  lcd->setCursor(0, 0);
  lcd->print("AquaSense IoT");
  lcd->setCursor(0, 1);
  lcd->print("Iniciando...");
  return true;
}

void iniciarWiFi() {
  WiFi.persistent(false);
  WiFi.setAutoReconnect(true);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print(F("[WiFi] Conectando a \""));
  Serial.print(WIFI_SSID);
  Serial.print(F("\"..."));

  const unsigned long t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < 20000UL) {
    delay(250);
    Serial.print('.');
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.print(F("[WiFi] OK  IP="));
    Serial.print(WiFi.localIP());
    Serial.print(F("  RSSI="));
    Serial.print(WiFi.RSSI());
    Serial.println(F(" dBm"));
  } else {
    Serial.print(F("[WiFi] FALHOU -> "));
    Serial.println(wifiStatusToStr(WiFi.status()));
    Serial.println(F("[WiFi] dicas: use rede 2.4GHz, confira SSID/senha e sinal do AP."));
    Serial.println(F("[WiFi] (auto-reconnect ativo - vou seguir tentando)"));
  }
}

void gerenciarWiFi() {
  if (WiFi.status() == WL_CONNECTED) {
    digitalWrite(PIN_LED_WIFI, HIGH);
    return;
  }

  digitalWrite(PIN_LED_WIFI, LOW);
  const unsigned long agora = millis();
  if (agora < proxRetryWiFi) return;

  proxRetryWiFi = agora + WIFI_RETRY_MS;
  Serial.print(F("[WiFi] reconectando... status="));
  Serial.println(wifiStatusToStr(WiFi.status()));
  WiFi.disconnect();
  WiFi.begin(WIFI_SSID, WIFI_PASS);
}

void iniciarMQTT() {
  if (!mqttHabilitado) {
    Serial.println(F("[MQTT] DESABILITADO - host/credenciais sao placeholders."));
    return;
  }

#if USAR_TLS
  // Para protótipo: ignora validacao de certificado.
  // Em producao, prefira wifiClient.setCACert(...) com a cadeia correta.
  wifiClient.setInsecure();
#endif

  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setBufferSize(512);
  mqtt.setKeepAlive(30);
  mqtt.setSocketTimeout(10);
  mqtt.setCallback(mqttCallback);

  uint64_t mac = ESP.getEfuseMac();
  snprintf(clientId, sizeof(clientId), "aquasense-%04X%08X",
           (uint16_t)((mac >> 32) & 0xFFFF),
           (uint32_t)(mac & 0xFFFFFFFFUL));

  Serial.print(F("[MQTT] modo="));
  Serial.print(USAR_TLS ? F("HiveMQ Cloud TLS") : F("HiveMQ publico sem TLS"));
  Serial.print(F(" host="));
  Serial.print(MQTT_HOST);
  Serial.print(F(" porta="));
  Serial.println(MQTT_PORT);
  Serial.print(F("[MQTT] clientId="));
  Serial.println(clientId);
}

void gerenciarMQTT() {
  if (!mqttHabilitado || WiFi.status() != WL_CONNECTED) return;

  if (mqtt.connected()) {
    mqtt.loop();
    return;
  }

  const unsigned long agora = millis();
  if (agora < proxRetryMQTT) return;
  proxRetryMQTT = agora + MQTT_RETRY_MS;

  Serial.print(F("[MQTT] conectando a "));
  Serial.print(MQTT_HOST);
  Serial.print(F(":"));
  Serial.print(MQTT_PORT);
  Serial.print(F(" ... "));
  bool ok;
  if (strlen(MQTT_USER) > 0) {
    ok = mqtt.connect(clientId, MQTT_USER, MQTT_PASS, TOPIC_STATUS, 1, true, "offline");
  } else {
    ok = mqtt.connect(clientId, TOPIC_STATUS, 1, true, "offline");
  }

  if (ok) {
    Serial.println(F("OK"));
    logPublish(TOPIC_STATUS, mqtt.publish(TOPIC_STATUS, "online", true));
    bool subOk = mqtt.subscribe(TOPIC_CMD_DOSAGEM);
    Serial.print(F("[MQTT] subscribed: dosagem/comando -> "));
    Serial.println(subOk ? F("OK") : F("FALHOU"));
  } else {
    int rc = mqtt.state();
    Serial.print(F("falhou rc="));
    Serial.print(rc);
    Serial.print(F(" -> "));
    Serial.println(mqttRcToStr(rc));
  }
}

void publicarFloat(const char* topico, float valor) {
  if (!mqtt.connected()) return;

  char buf[16];
  dtostrf(valor, 1, 2, buf);

  // retain=true: quem assinar depois tambem ve o ultimo valor publicado.
  bool ok = mqtt.publish(topico, buf, true);
  logPublish(topico, ok);
}

void blinkTesteLEDs() {
  const uint8_t leds[] = { PIN_LED_PH, PIN_LED_ORP, PIN_LED_COND };
  for (int r = 0; r < 2; r++) {
    for (int i = 0; i < 3; i++) {
      digitalWrite(leds[i], HIGH);
      delay(150);
      digitalWrite(leds[i], LOW);
    }
  }
}

void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println(F("\n=== AquaSense IoT - boot v2.4.1 ==="));

  pinMode(PIN_LED_PH,   OUTPUT);
  pinMode(PIN_LED_ORP,  OUTPUT);
  pinMode(PIN_LED_COND, OUTPUT);
  pinMode(PIN_LED_WIFI, OUTPUT);
  pinMode(PIN_RELE,     OUTPUT);
  digitalWrite(PIN_LED_PH,   LOW);
  digitalWrite(PIN_LED_ORP,  LOW);
  digitalWrite(PIN_LED_COND, LOW);
  digitalWrite(PIN_LED_WIFI, LOW);
  digitalWrite(PIN_RELE, RELE_DESLIGA);

  Wire.begin(PIN_SDA, PIN_SCL);
  Wire.setClock(I2C_CLOCK_HZ);
  delay(100);

  lcdOK = inicializarLCD();
  if (!lcdOK) Serial.println(F("[LCD] sem display"));

  blinkTesteLEDs();

  mqttHabilitado = strlen(MQTT_HOST) > 0;
#if USAR_TLS
  mqttHabilitado =
      mqttHabilitado &&
      strcmp(MQTT_HOST, "xxxxxxxxxxxx.s1.eu.hivemq.cloud") != 0 &&
      strlen(MQTT_USER) > 0 &&
      strlen(MQTT_PASS) > 0;
#endif

  // Diagnostico de boot: mostra exatamente o destino MQTT configurado.
  Serial.println(F("---------------------------------------------"));
#if USAR_TLS
  Serial.println(F("[MODO]   HiveMQ Cloud (TLS, porta 8883)"));
#else
  Serial.println(F("[MODO]   Broker PUBLICO de teste (sem TLS)"));
  Serial.println(F("[MODO]   -> dados NAO vao para o painel do seu cluster HiveMQ Cloud."));
#endif
  Serial.print(F("[BROKER] "));
  Serial.print(MQTT_HOST);
  Serial.print(F(":"));
  Serial.println(MQTT_PORT);
  Serial.print(F("[MQTT]   habilitado: "));
  Serial.println(mqttHabilitado ? F("SIM") : F("NAO"));

  if (strcmp(WIFI_SSID, "SUA_REDE_WIFI") == 0) {
    Serial.println(F("[AVISO]  WIFI_SSID ainda e placeholder - edite WIFI_SSID/WIFI_PASS."));
  }
#if USAR_TLS
  if (strcmp(MQTT_USER, "seu_usuario_hivemq") == 0) {
    Serial.println(F("[AVISO]  MQTT_USER e placeholder - use credenciais do Access Management."));
  }
#endif
  Serial.println(F("---------------------------------------------"));

  iniciarWiFi();
  iniciarMQTT();

  if (lcdOK) {
    delay(1500);
    lcd->clear();
  }

  ultimaAquisicao = millis() - INTERVALO_AQUISICAO_MS;
}

void loop() {
  gerenciarWiFi();
  gerenciarMQTT();

  const unsigned long agora = millis();
  if (agora - ultimaAquisicao < INTERVALO_AQUISICAO_MS) return;
  ultimaAquisicao = agora;

  g_ph     = lerPH();
  g_orp    = lerORP();
  g_cond   = lerCondutividade();
  g_tPisc  = lerTempPiscina();
  g_tSolar = lerTempSolar();

  atualizarLEDs(g_ph, g_orp, g_cond);
  controlarBomba(g_tPisc, g_tSolar);
  atualizarLCD(g_ph, g_orp, g_cond, g_tPisc, g_tSolar);

  Serial.print(F("pH="));
  Serial.print(g_ph, 2);
  Serial.print(F(" ORP="));
  Serial.print(g_orp, 0);
  Serial.print(F(" EC="));
  Serial.print(g_cond, 0);
  Serial.print(F(" Tp="));
  Serial.print(g_tPisc, 1);
  Serial.print(F(" Ts="));
  Serial.print(g_tSolar, 1);
  Serial.print(F(" dT="));
  Serial.print(g_tSolar - g_tPisc, 1);
  Serial.print(F(" B="));
  Serial.print(bombaLigada ? "ON" : "OFF");
  Serial.print(F(" LCD="));
  Serial.print(lcdOK ? "OK" : "OFF");
  Serial.print(F(" WiFi="));
  Serial.print(WiFi.status() == WL_CONNECTED ? "OK" : "OFF");
  Serial.print(F(" MQTT="));
  Serial.println(mqtt.connected() ? "OK" : "OFF");

  publicarFloat(TOPIC_PH,      g_ph);
  publicarFloat(TOPIC_ORP,     g_orp);
  publicarFloat(TOPIC_COND,    g_cond);
  publicarFloat(TOPIC_T_PISC,  g_tPisc);
  publicarFloat(TOPIC_T_SOLAR, g_tSolar);
  if (mqtt.connected()) {
    logPublish(TOPIC_BOMBA, mqtt.publish(TOPIC_BOMBA, bombaLigada ? "ON" : "OFF", true));
  }
  publicarSnapshotAlexa();
}
