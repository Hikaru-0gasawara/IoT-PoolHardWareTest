/*
 * ============================================================================
 *  AquaSense IoT  -  Firmware do protótipo (com LEDs no lugar dos sensores)
 *  IBMEC São Paulo / Invivio Tecnologia Ltda
 *  Sistemas Embarcados - Prof. Marcel Stefan Wagner, PhD
 *  Grupo 1: Okaru, João Perestrelo, Roan
 * ============================================================================
 *
 *  Mapeamento de pinos:
 *     D4  -> LED 1   (indicador de pH fora da faixa ideal)
 *     D18 -> LED 2   (indicador de ORP fora da faixa ideal)
 *     D19 -> LED 3   (indicador de condutividade fora da faixa ideal)
 *     D21 -> LCD SDA  (barramento I2C)
 *     D22 -> LCD SCL  (barramento I2C)
 *     D26 -> Relé IN  (controle da bomba do coletor solar)
 *
 *  Bibliotecas necessárias:
 *    - WiFi                                  (nativa do ESP32)
 *    - PubSubClient                          (Nick O'Leary)
 *    - Arduino-LiquidCrystal-I2C-library     (versão com lcd.begin() sem args)
 * ============================================================================
 */

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>

// ============================================================================
//  PINOS
// ============================================================================
#define PIN_LED_PH     4
#define PIN_LED_ORP    18
#define PIN_LED_COND   19
#define PIN_RELE       26
#define PIN_SDA        21
#define PIN_SCL        22

#define RELE_ACTIVE_LOW   1
#if RELE_ACTIVE_LOW
  #define RELE_LIGA   LOW
  #define RELE_DESLIGA HIGH
#else
  #define RELE_LIGA   HIGH
  #define RELE_DESLIGA LOW
#endif

// ============================================================================
//  LCD I2C 16x2
// ============================================================================
LiquidCrystal_I2C lcd(0x27, 16, 2);

// ============================================================================
//  WIFI / MQTT  (HiveMQ Cloud)
// ============================================================================
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

WiFiClientSecure wifiClient;
PubSubClient     mqtt(wifiClient);

// ============================================================================
//  PARÂMETROS DE OPERAÇÃO
// ============================================================================
const unsigned long INTERVALO_AQUISICAO_MS = 5000;

const float         DELTA_LIGAR_C       = 5.0;
const float         DELTA_DESLIGAR_C    = 1.0;
const unsigned long ANTI_CYCLING_MS     = 60000UL;

const float PH_MIN   = 7.2,  PH_MAX   = 7.6;
const float ORP_MIN  = 650,  ORP_MAX  = 750;
const float COND_MIN = 800,  COND_MAX = 1500;

// ============================================================================
//  ESTADO GLOBAL
// ============================================================================
unsigned long ultimaAquisicao    = 0;
unsigned long ultimaMudancaBomba = 0;
bool          bombaLigada        = false;

// ============================================================================
//  SIMULAÇÃO DOS SENSORES
// ============================================================================
float lerPH() {
  return 7.4 + sin(millis() / 30000.0) * 0.4;
}
float lerORP() {
  return 700.0 + sin(millis() / 25000.0) * 60.0;
}
float lerCondutividade() {
  return 1100.0 + sin(millis() / 40000.0) * 300.0;
}
float lerTempPiscina() {
  return 24.0 + sin(millis() / 60000.0) * 2.0;
}
float lerTempSolar() {
  return 28.0 + sin(millis() / 45000.0) * 8.0;
}

// ============================================================================
//  INDICAÇÃO POR LED
// ============================================================================
void atualizarLEDs(float ph, float orp, float cond) {
  digitalWrite(PIN_LED_PH,   (ph   < PH_MIN   || ph   > PH_MAX)   ? HIGH : LOW);
  digitalWrite(PIN_LED_ORP,  (orp  < ORP_MIN  || orp  > ORP_MAX)  ? HIGH : LOW);
  digitalWrite(PIN_LED_COND, (cond < COND_MIN || cond > COND_MAX) ? HIGH : LOW);
}

// ============================================================================
//  CONTROLE DA BOMBA - HISTERESE COM ANTI-CYCLING
// ============================================================================
void controlarBomba(float tPiscina, float tSolar) {
  float deltaT = tSolar - tPiscina;
  unsigned long agora = millis();

  if (agora - ultimaMudancaBomba < ANTI_CYCLING_MS) {
    return;
  }

  if (!bombaLigada && deltaT >= DELTA_LIGAR_C) {
    bombaLigada = true;
    digitalWrite(PIN_RELE, RELE_LIGA);
    ultimaMudancaBomba = agora;
    Serial.println(F("[BOMBA] LIGADA  (deltaT atingiu 5 C)"));
  }
  else if (bombaLigada && deltaT <= DELTA_DESLIGAR_C) {
    bombaLigada = false;
    digitalWrite(PIN_RELE, RELE_DESLIGA);
    ultimaMudancaBomba = agora;
    Serial.println(F("[BOMBA] DESLIGADA (deltaT caiu para 1 C)"));
  }
}

// ============================================================================
//  LCD - duas telas alternando a cada ciclo
// ============================================================================
void atualizarLCD(float ph, float orp, float cond, float tPisc, float tSolar) {
  static bool tela = false;
  tela = !tela;

  lcd.clear();
  if (!tela) {
    lcd.setCursor(0, 0);
    lcd.print("pH");
    lcd.print(ph, 2);
    lcd.print(" ORP");
    lcd.print((int)orp);
    lcd.setCursor(0, 1);
    lcd.print("EC");
    lcd.print((int)cond);
    lcd.print(" B:");
    lcd.print(bombaLigada ? "ON " : "OFF");
  } else {
    lcd.setCursor(0, 0);
    lcd.print("Tp:");
    lcd.print(tPisc, 1);
    lcd.print((char)223);
    lcd.print("C");
    lcd.setCursor(0, 1);
    lcd.print("Ts:");
    lcd.print(tSolar, 1);
    lcd.print((char)223);
    lcd.print("C ");
    lcd.print(bombaLigada ? "ON" : "OFF");
  }
}

// ============================================================================
//  WI-FI
// ============================================================================
void conectarWiFi() {
  Serial.print(F("Conectando ao Wi-Fi"));
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  unsigned long t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < 20000) {
    delay(400);
    Serial.print('.');
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.print(F(" OK  IP="));
    Serial.println(WiFi.localIP());
  } else {
    Serial.println(F(" FALHOU (seguindo offline)"));
  }
}

// ============================================================================
//  MQTT
// ============================================================================
void conectarMQTT() {
  if (WiFi.status() != WL_CONNECTED) return;

  wifiClient.setInsecure();
  mqtt.setServer(MQTT_HOST, MQTT_PORT);

  int tentativas = 0;
  while (!mqtt.connected() && tentativas < 3) {
    Serial.print(F("Conectando MQTT..."));
    String clientId = "aquasense-" + String((uint32_t)ESP.getEfuseMac(), HEX);
    if (mqtt.connect(clientId.c_str(), MQTT_USER, MQTT_PASS)) {
      Serial.println(F(" OK"));
    } else {
      Serial.print(F(" rc="));
      Serial.print(mqtt.state());
      Serial.println(F(" - retry em 3s"));
      delay(3000);
      tentativas++;
    }
  }
}

void publicarFloat(const char* topico, float valor) {
  if (!mqtt.connected()) return;
  char buf[16];
  dtostrf(valor, 1, 2, buf);
  mqtt.publish(topico, buf);
}

// ============================================================================
//  TESTE INICIAL DOS LEDS
// ============================================================================
void blinkTesteLEDs() {
  const uint8_t leds[] = { PIN_LED_PH, PIN_LED_ORP, PIN_LED_COND };
  for (int rodada = 0; rodada < 2; rodada++) {
    for (int i = 0; i < 3; i++) {
      digitalWrite(leds[i], HIGH);
      delay(180);
      digitalWrite(leds[i], LOW);
    }
  }
}

// ============================================================================
//  SETUP
// ============================================================================
void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.println(F("\n=== AquaSense IoT - boot ==="));

  pinMode(PIN_LED_PH,   OUTPUT);
  pinMode(PIN_LED_ORP,  OUTPUT);
  pinMode(PIN_LED_COND, OUTPUT);
  pinMode(PIN_RELE,     OUTPUT);
  digitalWrite(PIN_LED_PH,   LOW);
  digitalWrite(PIN_LED_ORP,  LOW);
  digitalWrite(PIN_LED_COND, LOW);
  digitalWrite(PIN_RELE, RELE_DESLIGA);

  Wire.begin(PIN_SDA, PIN_SCL);
  lcd.begin();
  lcd.backlight();
  lcd.setCursor(0, 0);
  lcd.print("AquaSense IoT");
  lcd.setCursor(0, 1);
  lcd.print("Iniciando...");

  blinkTesteLEDs();

  conectarWiFi();
  conectarMQTT();

  lcd.clear();
  ultimaAquisicao = millis() - INTERVALO_AQUISICAO_MS;
}

// ============================================================================
//  LOOP
// ============================================================================
void loop() {
  if (WiFi.status() == WL_CONNECTED && !mqtt.connected()) {
    conectarMQTT();
  }
  mqtt.loop();

  unsigned long agora = millis();
  if (agora - ultimaAquisicao < INTERVALO_AQUISICAO_MS) return;
  ultimaAquisicao = agora;

  float ph       = lerPH();
  float orp      = lerORP();
  float cond     = lerCondutividade();
  float tPisc    = lerTempPiscina();
  float tSolar   = lerTempSolar();

  atualizarLEDs(ph, orp, cond);
  controlarBomba(tPisc, tSolar);
  atualizarLCD(ph, orp, cond, tPisc, tSolar);

  Serial.print(F("pH=")); Serial.print(ph, 2);
  Serial.print(F(" ORP=")); Serial.print(orp, 0);
  Serial.print(F(" EC=")); Serial.print(cond, 0);
  Serial.print(F(" Tp=")); Serial.print(tPisc, 1);
  Serial.print(F(" Ts=")); Serial.print(tSolar, 1);
  Serial.print(F(" dT=")); Serial.print(tSolar - tPisc, 1);
  Serial.print(F(" B=")); Serial.println(bombaLigada ? "ON" : "OFF");

  publicarFloat(TOPIC_PH,      ph);
  publicarFloat(TOPIC_ORP,     orp);
  publicarFloat(TOPIC_COND,    cond);
  publicarFloat(TOPIC_T_PISC,  tPisc);
  publicarFloat(TOPIC_T_SOLAR, tSolar);
  if (mqtt.connected()) {
    mqtt.publish(TOPIC_BOMBA, bombaLigada ? "ON" : "OFF");
  }
}
