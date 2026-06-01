#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>

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

LiquidCrystal_I2C* lcd = nullptr;
bool lcdOK = false;
uint8_t enderecoLCD = 0;

const char* WIFI_SSID = "SUA_REDE_WIFI";
const char* WIFI_PASS = "SUA_SENHA_WIFI";

const char* MQTT_HOST = "xxxxxxxxxxxx.s1.eu.hivemq.cloud";
const int   MQTT_PORT = 8883;
const char* MQTT_USER = "seu_usuario_hivemq";
const char* MQTT_PASS = "sua_senha_hivemq";

const char* TOPIC_PH       = "aquasense/agua/ph";
const char* TOPIC_ORP      = "aquasense/agua/orp";
const char* TOPIC_COND     = "aquasense/agua/condutividade";
const char* TOPIC_T_PISC   = "aquasense/temperatura/piscina";
const char* TOPIC_T_SOLAR  = "aquasense/temperatura/coletor";
const char* TOPIC_BOMBA    = "aquasense/bomba/estado";
const char* TOPIC_STATUS   = "aquasense/sistema/status";

WiFiClientSecure wifiClient;
PubSubClient     mqtt(wifiClient);

bool mqttHabilitado = false;
char clientId[24];

const unsigned long INTERVALO_AQUISICAO_MS = 5000;
const float         DELTA_LIGAR_C          = 5.0f;
const float         DELTA_DESLIGAR_C       = 1.0f;
const unsigned long ANTI_CYCLING_MS        = 60000UL;

const float PH_MIN   = 7.2f,   PH_MAX   = 7.6f;
const float ORP_MIN  = 650.0f, ORP_MAX  = 750.0f;
const float COND_MIN = 800.0f, COND_MAX = 1500.0f;

const unsigned long WIFI_RETRY_MS = 10000UL;
const unsigned long MQTT_RETRY_MS = 5000UL;

unsigned long ultimaAquisicao    = 0;
unsigned long ultimaMudancaBomba = 0;
unsigned long proxRetryWiFi      = 0;
unsigned long proxRetryMQTT      = 0;
bool          bombaLigada        = false;
bool          primeiroCiclo      = true;

float lerPH()            { return 7.4f   + sinf(millis() / 30000.0f) * 0.4f;   }
float lerORP()           { return 700.0f + sinf(millis() / 25000.0f) * 60.0f;  }
float lerCondutividade() { return 1100.0f + sinf(millis() / 40000.0f) * 300.0f; }
float lerTempPiscina()   { return 24.0f  + sinf(millis() / 60000.0f) * 2.0f;   }
float lerTempSolar()     { return 28.0f  + sinf(millis() / 45000.0f) * 8.0f;   }

inline bool foraDaFaixa(float v, float lo, float hi) {
  return (v < lo) || (v > hi);
}

void atualizarLEDs(float ph, float orp, float cond) {
  digitalWrite(PIN_LED_PH,   foraDaFaixa(ph,   PH_MIN,   PH_MAX)   ? HIGH : LOW);
  digitalWrite(PIN_LED_ORP,  foraDaFaixa(orp,  ORP_MIN,  ORP_MAX)  ? HIGH : LOW);
  digitalWrite(PIN_LED_COND, foraDaFaixa(cond, COND_MIN, COND_MAX) ? HIGH : LOW);
}

void controlarBomba(float tPiscina, float tSolar) {
  const float deltaT = tSolar - tPiscina;
  const unsigned long agora = millis();

  if (!primeiroCiclo && (agora - ultimaMudancaBomba < ANTI_CYCLING_MS)) {
    return;
  }

  if (!bombaLigada && deltaT >= DELTA_LIGAR_C) {
    bombaLigada = true;
    digitalWrite(PIN_RELE, RELE_LIGA);
    ultimaMudancaBomba = agora;
    primeiroCiclo = false;
    Serial.println(F("[BOMBA] LIGADA (dT >= 5C)"));
  }
  else if (bombaLigada && deltaT <= DELTA_DESLIGAR_C) {
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
  if (!lcdOK) return;

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
  Serial.println(F("[I2C] escaneando barramento..."));
  uint8_t encontrado = 0;
  for (uint8_t addr = 1; addr < 127; addr++) {
    Wire.beginTransmission(addr);
    if (Wire.endTransmission() == 0) {
      Serial.print(F("      dispositivo em 0x"));
      if (addr < 16) Serial.print('0');
      Serial.println(addr, HEX);
      if (encontrado == 0) encontrado = addr;
    }
  }
  if (encontrado == 0) Serial.println(F("      nenhum dispositivo encontrado"));
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
    Serial.println(F("[LCD] FALHOU - verifique fios SDA=D21 SCL=D22 e GND comum"));
    return false;
  }

  enderecoLCD = addr;
  Serial.print(F("[LCD] usando endereco 0x"));
  Serial.println(addr, HEX);

  lcd = new LiquidCrystal_I2C(addr, 16, 2);
  delay(50);
  lcd->init();
  delay(100);
  lcd->backlight();
  delay(50);
  lcd->clear();
  delay(50);
  lcd->setCursor(0, 0);
  lcd->print("AquaSense IoT");
  lcd->setCursor(0, 1);
  lcd->print("0x");
  lcd->print(addr, HEX);
  lcd->print(" Iniciando");
  return true;
}

void iniciarWiFi() {
  WiFi.persistent(false);
  WiFi.setAutoReconnect(true);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print(F("[WiFi] Conectando a \""));
  Serial.print(WIFI_SSID);
  Serial.println(F("\"..."));

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
    Serial.println(F("[WiFi] FALHOU no boot (auto-reconnect ativo)"));
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

  Serial.println(F("[WiFi] reconectando..."));
  WiFi.disconnect();
  WiFi.begin(WIFI_SSID, WIFI_PASS);
}

void iniciarMQTT() {
  if (!mqttHabilitado) {
    Serial.println(F("[MQTT] desabilitado (credenciais nao preenchidas)"));
    return;
  }

  wifiClient.setInsecure();
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setBufferSize(512);
  mqtt.setKeepAlive(30);
  mqtt.setSocketTimeout(10);

  uint64_t mac = ESP.getEfuseMac();
  snprintf(clientId, sizeof(clientId), "aquasense-%04X%08X",
           (uint16_t)((mac >> 32) & 0xFFFF),
           (uint32_t)(mac & 0xFFFFFFFFUL));

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

  Serial.print(F("[MQTT] conectando ao broker..."));
  bool ok = mqtt.connect(
      clientId, MQTT_USER, MQTT_PASS,
      TOPIC_STATUS, 1, true, "offline"
  );

  if (ok) {
    Serial.println(F(" OK"));
    mqtt.publish(TOPIC_STATUS, "online", true);
  } else {
    Serial.print(F(" falhou rc="));
    Serial.println(mqtt.state());
  }
}

void publicarFloat(const char* topico, float valor) {
  if (!mqtt.connected()) return;
  char buf[16];
  dtostrf(valor, 1, 2, buf);
  mqtt.publish(topico, buf);
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
  Serial.println(F("\n=== AquaSense IoT - boot v2.1 ==="));

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
  if (!lcdOK) Serial.println(F("[LCD] sistema continuara sem display"));

  blinkTesteLEDs();

  mqttHabilitado =
      strlen(MQTT_HOST) > 0 &&
      strcmp(MQTT_HOST, "xxxxxxxxxxxx.s1.eu.hivemq.cloud") != 0 &&
      strlen(MQTT_USER) > 0 &&
      strlen(MQTT_PASS) > 0;

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

  const float ph     = lerPH();
  const float orp    = lerORP();
  const float cond   = lerCondutividade();
  const float tPisc  = lerTempPiscina();
  const float tSolar = lerTempSolar();

  atualizarLEDs(ph, orp, cond);
  controlarBomba(tPisc, tSolar);
  atualizarLCD(ph, orp, cond, tPisc, tSolar);

  Serial.print(F("pH="));   Serial.print(ph, 2);
  Serial.print(F(" ORP=")); Serial.print(orp, 0);
  Serial.print(F(" EC="));  Serial.print(cond, 0);
  Serial.print(F(" Tp="));  Serial.print(tPisc, 1);
  Serial.print(F(" Ts="));  Serial.print(tSolar, 1);
  Serial.print(F(" dT="));  Serial.print(tSolar - tPisc, 1);
  Serial.print(F(" B="));   Serial.print(bombaLigada ? "ON " : "OFF");
  Serial.print(F(" LCD=")); Serial.print(lcdOK ? "OK" : "OFF");
  Serial.print(F(" WiFi="));Serial.print(WiFi.status() == WL_CONNECTED ? "OK " : "OFF");
  Serial.print(F(" MQTT="));Serial.println(mqtt.connected() ? "OK" : "OFF");

  publicarFloat(TOPIC_PH,      ph);
  publicarFloat(TOPIC_ORP,     orp);
  publicarFloat(TOPIC_COND,    cond);
  publicarFloat(TOPIC_T_PISC,  tPisc);
  publicarFloat(TOPIC_T_SOLAR, tSolar);
  if (mqtt.connected()) {
    mqtt.publish(TOPIC_BOMBA, bombaLigada ? "ON" : "OFF", true);
  }
}
