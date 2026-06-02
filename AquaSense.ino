#include <WiFi.h>
#include <PubSubClient.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>

// ============================================================
// PINOS
// ============================================================

#define PIN_LED_PH     4
#define PIN_LED_WIFI   5
#define PIN_LED_ORP    18
#define PIN_LED_COND   19
#define PIN_RELE       26

#define PIN_SDA        21
#define PIN_SCL        22

#define I2C_CLOCK_HZ   100000UL

// ============================================================
// CONFIGURAÇÃO DO RELÉ
// ============================================================

#define RELE_ACTIVE_LOW   1

#if RELE_ACTIVE_LOW
  #define RELE_LIGA    LOW
  #define RELE_DESLIGA HIGH
#else
  #define RELE_LIGA    HIGH
  #define RELE_DESLIGA LOW
#endif

// ============================================================
// LCD I2C
// ============================================================

LiquidCrystal_I2C* lcd = nullptr;

bool lcdOK = false;
uint8_t lcdEndereco = 0;

// ============================================================
// WIFI
// ============================================================

const char* WIFI_SSID = "SUA_REDE_WIFI";
const char* WIFI_PASS = "SUA_SENHA_WIFI";

// ============================================================
// HIVEMQ LOCAL / MQTT LOCAL
// ============================================================

// Coloque aqui o IP do computador/servidor onde o HiveMQ local está rodando.
// Exemplo: "192.168.1.100"
const char* MQTT_HOST = "192.168.1.100";

// HiveMQ local normalmente usa 1883 sem TLS.
const int MQTT_PORT = 1883;

// Se seu HiveMQ local não usa login/senha, deixe vazio.
const char* MQTT_USER = "";
const char* MQTT_PASS = "";

const bool MQTT_USA_LOGIN = false;

// ============================================================
// TÓPICOS MQTT
// ============================================================

const char* TOPIC_PH       = "aquasense/agua/ph";
const char* TOPIC_ORP      = "aquasense/agua/orp";
const char* TOPIC_COND     = "aquasense/agua/condutividade";
const char* TOPIC_T_PISC   = "aquasense/temperatura/piscina";
const char* TOPIC_T_SOLAR  = "aquasense/temperatura/coletor";
const char* TOPIC_BOMBA    = "aquasense/bomba/estado";
const char* TOPIC_STATUS   = "aquasense/sistema/status";

// Agora usa WiFiClient normal, sem TLS.
WiFiClient wifiClient;
PubSubClient mqtt(wifiClient);

bool mqttHabilitado = true;  // permite desligar MQTT mantendo o restante do firmware
char clientId[32];

// ============================================================
// CONFIGURAÇÕES DO SISTEMA
// ============================================================

const unsigned long INTERVALO_AQUISICAO_MS = 5000;

const float DELTA_LIGAR_C    = 5.0f;
const float DELTA_DESLIGAR_C = 1.0f;

const unsigned long ANTI_CYCLING_MS = 60000UL;

const float PH_MIN   = 7.2f;
const float PH_MAX   = 7.6f;

const float ORP_MIN  = 650.0f;
const float ORP_MAX  = 750.0f;

const float COND_MIN = 800.0f;
const float COND_MAX = 1500.0f;

const unsigned long WIFI_RETRY_MS = 10000UL;
const unsigned long MQTT_RETRY_MS = 5000UL;

unsigned long ultimaAquisicao    = 0;
unsigned long ultimaMudancaBomba = 0;
unsigned long proxRetryWiFi      = 0;
unsigned long proxRetryMQTT      = 0;

bool bombaLigada   = false;
bool primeiroCiclo = true;

// ============================================================
// SIMULAÇÃO DE SENSORES
// ============================================================

float lerPH() {
  return 7.4f + sinf(millis() / 30000.0f) * 0.4f;
}

float lerORP() {
  return 700.0f + sinf(millis() / 25000.0f) * 60.0f;
}

float lerCondutividade() {
  return 1100.0f + sinf(millis() / 40000.0f) * 300.0f;
}

float lerTempPiscina() {
  return 24.0f + sinf(millis() / 60000.0f) * 2.0f;
}

float lerTempSolar() {
  return 28.0f + sinf(millis() / 45000.0f) * 8.0f;
}

// ============================================================
// FUNÇÕES AUXILIARES
// ============================================================

inline bool foraDaFaixa(float v, float lo, float hi) {
  return (v < lo) || (v > hi);
}

// ============================================================
// LEDs
// ============================================================

void atualizarLEDs(float ph, float orp, float cond) {
  // LEDs dos sensores ficam naturalmente ligados o tempo todo.
  (void)ph;
  (void)orp;
  (void)cond;
  digitalWrite(PIN_LED_PH,   HIGH);
  digitalWrite(PIN_LED_ORP,  HIGH);
  digitalWrite(PIN_LED_COND, HIGH);
}

// ============================================================
// CONTROLE DA BOMBA
// ============================================================

void controlarBomba(float ph, float orp, float cond) {
  const bool irregular = foraDaFaixa(ph, PH_MIN, PH_MAX) ||
                         foraDaFaixa(orp, ORP_MIN, ORP_MAX) ||
                         foraDaFaixa(cond, COND_MIN, COND_MAX);
  const unsigned long agora = millis();

  if (!primeiroCiclo && (agora - ultimaMudancaBomba < ANTI_CYCLING_MS)) {
    return;
  }

  if (!bombaLigada && irregular) {
    bombaLigada = true;
    digitalWrite(PIN_RELE, RELE_LIGA);
    ultimaMudancaBomba = agora;
    primeiroCiclo = false;
    Serial.println(F("[RELE] LIGADO (dados irregulares)"));
  }
  else if (bombaLigada && !irregular) {
    bombaLigada = false;
    digitalWrite(PIN_RELE, RELE_DESLIGA);
    ultimaMudancaBomba = agora;
    primeiroCiclo = false;
    Serial.println(F("[RELE] DESLIGADO (dados normalizados)"));
  }
}

// ============================================================
// LCD
// ============================================================

uint8_t escanearLCD() {
  Serial.println(F("[LCD] Escaneando barramento I2C..."));

  uint8_t encontrados = 0;
  uint8_t primeiroEndereco = 0;

  for (uint8_t addr = 1; addr < 127; addr++) {
    Wire.beginTransmission(addr);
    uint8_t erro = Wire.endTransmission();

    if (erro == 0) {
      Serial.print(F("[LCD] Dispositivo encontrado em 0x"));

      if (addr < 16) {
        Serial.print('0');
      }

      Serial.println(addr, HEX);

      if (primeiroEndereco == 0) {
        primeiroEndereco = addr;
      }

      encontrados++;
    }
  }

  if (encontrados == 0) {
    Serial.println(F("[LCD] Nenhum dispositivo I2C encontrado."));
    return 0;
  }

  // Dá preferência aos endereços comuns de LCD.
  const uint8_t enderecosLCD[] = { 0x27, 0x3F, 0x20, 0x38 };

  for (uint8_t i = 0; i < (sizeof(enderecosLCD) / sizeof(enderecosLCD[0])); i++) {
    uint8_t addr = enderecosLCD[i];

    Wire.beginTransmission(addr);
    if (Wire.endTransmission() == 0) {
      Serial.print(F("[LCD] Usando endereco 0x"));

      if (addr < 16) {
        Serial.print('0');
      }

      Serial.println(addr, HEX);
      return addr;
    }
  }

  return primeiroEndereco;
}

void escreverLinhaLCD(uint8_t linha, const char* texto) {
  if (!lcdOK || lcd == nullptr) {
    return;
  }

  char buf[17];

  size_t n = strlen(texto);

  if (n > 16) {
    n = 16;
  }

  memcpy(buf, texto, n);
  memset(buf + n, ' ', 16 - n);

  buf[16] = '\0';

  lcd->setCursor(0, linha);
  lcd->print(buf);
}

void inicializarLCD() {
  lcdEndereco = escanearLCD();

  if (lcdEndereco == 0) {
    lcdOK = false;
    Serial.println(F("[LCD] Operando sem display."));
    return;
  }

  lcd = new LiquidCrystal_I2C(lcdEndereco, 16, 2);

  lcd->begin();
  lcd->backlight();
  lcd->clear();

  lcdOK = true;

  escreverLinhaLCD(0, "AquaSense IoT");
  escreverLinhaLCD(1, "LCD iniciado");

  Serial.println(F("[LCD] Inicializado com sucesso."));

  delay(2000);

  lcd->clear();
}

void atualizarLCD(float ph, float orp, float cond, float tPisc, float tSolar) {
  if (!lcdOK || lcd == nullptr) {
    return;
  }

  static bool tela = false;
  tela = !tela;

  char l1[17];
  char l2[17];

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

// ============================================================
// WIFI
// ============================================================

void iniciarWiFi() {
  WiFi.persistent(false);
  WiFi.setAutoReconnect(true);
  WiFi.mode(WIFI_STA);

  WiFi.begin(WIFI_SSID, WIFI_PASS);

  Serial.print(F("[WiFi] Conectando a "));
  Serial.println(WIFI_SSID);

  if (lcdOK) {
    escreverLinhaLCD(0, "Conectando WiFi");
    escreverLinhaLCD(1, WIFI_SSID);
  }

  const unsigned long t0 = millis();

  while (WiFi.status() != WL_CONNECTED && millis() - t0 < 20000UL) {
    delay(250);
    Serial.print('.');
  }

  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.print(F("[WiFi] Conectado. IP: "));
    Serial.println(WiFi.localIP());

    if (lcdOK) {
      escreverLinhaLCD(0, "WiFi conectado");
      char ip[17];
      snprintf(ip, sizeof(ip), "%s", WiFi.localIP().toString().c_str());
      escreverLinhaLCD(1, ip);
      delay(2000);
    }
  } else {
    Serial.println(F("[WiFi] Falhou no boot. Continuando offline."));

    if (lcdOK) {
      escreverLinhaLCD(0, "WiFi falhou");
      escreverLinhaLCD(1, "Modo offline");
      delay(2000);
    }
  }
}

void gerenciarWiFi() {
  if (WiFi.status() == WL_CONNECTED) {
    digitalWrite(PIN_LED_WIFI, HIGH);
    return;
  }

  digitalWrite(PIN_LED_WIFI, LOW);

  const unsigned long agora = millis();

  if (agora < proxRetryWiFi) {
    return;
  }

  proxRetryWiFi = agora + WIFI_RETRY_MS;

  Serial.println(F("[WiFi] Reconectando..."));

  WiFi.disconnect();
  WiFi.begin(WIFI_SSID, WIFI_PASS);
}

// ============================================================
// MQTT LOCAL
// ============================================================

void iniciarMQTT() {
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setBufferSize(512);
  mqtt.setKeepAlive(30);
  mqtt.setSocketTimeout(10);

  uint64_t mac = ESP.getEfuseMac();

  snprintf(
    clientId,
    sizeof(clientId),
    "aquasense-%04X%08X",
    (uint16_t)((mac >> 32) & 0xFFFF),
    (uint32_t)(mac & 0xFFFFFFFFUL)
  );

  Serial.print(F("[MQTT] Broker local: "));
  Serial.print(MQTT_HOST);
  Serial.print(F(":"));
  Serial.println(MQTT_PORT);

  Serial.print(F("[MQTT] Client ID: "));
  Serial.println(clientId);
}

void gerenciarMQTT() {
  if (!mqttHabilitado) {
    return;
  }

  if (WiFi.status() != WL_CONNECTED) {
    return;
  }

  if (mqtt.connected()) {
    mqtt.loop();
    return;
  }

  const unsigned long agora = millis();

  if (agora < proxRetryMQTT) {
    return;
  }

  proxRetryMQTT = agora + MQTT_RETRY_MS;

  Serial.print(F("[MQTT] Conectando ao HiveMQ local... "));

  bool ok;

  if (MQTT_USA_LOGIN) {
    ok = mqtt.connect(
      clientId,
      MQTT_USER,
      MQTT_PASS,
      TOPIC_STATUS,
      1,
      true,
      "offline"
    );
  } else {
    ok = mqtt.connect(
      clientId,
      TOPIC_STATUS,
      1,
      true,
      "offline"
    );
  }

  if (ok) {
    Serial.println(F("OK"));

    mqtt.publish(TOPIC_STATUS, "online", true);

    if (lcdOK) {
      escreverLinhaLCD(0, "MQTT conectado");
      escreverLinhaLCD(1, "HiveMQ local");
      delay(1000);
    }
  } else {
    Serial.print(F("falhou. rc="));
    Serial.println(mqtt.state());

    if (lcdOK) {
      escreverLinhaLCD(0, "MQTT falhou");
      char erro[17];
      snprintf(erro, sizeof(erro), "rc=%d", mqtt.state());
      escreverLinhaLCD(1, erro);
    }
  }
}

void publicarFloat(const char* topico, float valor) {
  if (!mqtt.connected()) {
    return;
  }

  char buf[16];

  dtostrf(valor, 1, 2, buf);

  mqtt.publish(topico, buf);
}

// ============================================================
// TESTE DE LEDs
// ============================================================

void blinkTesteLEDs() {
  const uint8_t leds[] = {
    PIN_LED_PH,
    PIN_LED_ORP,
    PIN_LED_COND
  };

  for (int r = 0; r < 2; r++) {
    for (int i = 0; i < 3; i++) {
      digitalWrite(leds[i], HIGH);
      delay(150);
      digitalWrite(leds[i], LOW);
    }
  }
}

// ============================================================
// SETUP
// ============================================================

void setup() {
  Serial.begin(115200);
  delay(300);

  Serial.println();
  Serial.println(F("======================================"));
  Serial.println(F(" AquaSense IoT - HiveMQ Local + LCD"));
  Serial.println(F("======================================"));

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

  inicializarLCD();

  blinkTesteLEDs();

  iniciarWiFi();
  iniciarMQTT();

  ultimaAquisicao = millis() - INTERVALO_AQUISICAO_MS;
}

// ============================================================
// LOOP
// ============================================================

void loop() {
  gerenciarWiFi();
  gerenciarMQTT();

  const unsigned long agora = millis();

  if (agora - ultimaAquisicao < INTERVALO_AQUISICAO_MS) {
    return;
  }

  ultimaAquisicao = agora;

  const float ph     = lerPH();
  const float orp    = lerORP();
  const float cond   = lerCondutividade();
  const float tPisc  = lerTempPiscina();
  const float tSolar = lerTempSolar();

  atualizarLEDs(ph, orp, cond);
  controlarBomba(ph, orp, cond);
  atualizarLCD(ph, orp, cond, tPisc, tSolar);

  Serial.print(F("pH="));
  Serial.print(ph, 2);

  Serial.print(F(" ORP="));
  Serial.print(orp, 0);

  Serial.print(F(" EC="));
  Serial.print(cond, 0);

  Serial.print(F(" Tp="));
  Serial.print(tPisc, 1);

  Serial.print(F(" Ts="));
  Serial.print(tSolar, 1);

  Serial.print(F(" dT="));
  Serial.print(tSolar - tPisc, 1);

  Serial.print(F(" B="));
  Serial.print(bombaLigada ? "ON " : "OFF ");

  Serial.print(F(" WiFi="));
  Serial.print(WiFi.status() == WL_CONNECTED ? "OK " : "OFF ");

  Serial.print(F(" MQTT="));
  Serial.println(mqtt.connected() ? "OK" : "OFF");

  publicarFloat(TOPIC_PH,      ph);
  publicarFloat(TOPIC_ORP,     orp);
  publicarFloat(TOPIC_COND,    cond);
  publicarFloat(TOPIC_T_PISC,  tPisc);
  publicarFloat(TOPIC_T_SOLAR, tSolar);

  if (mqtt.connected()) {
    mqtt.publish(TOPIC_BOMBA, bombaLigada ? "ON" : "OFF", true);
  }
}
