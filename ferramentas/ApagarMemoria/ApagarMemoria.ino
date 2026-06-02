/*
 * ============================================================
 *  AquaSense IoT - Utilitario: APAGAR MEMORIA
 * ============================================================
 *
 *  Sketch SEPARADO do firmware principal (AquaSense.ino).
 *  Use apenas quando quiser "zerar" o ESP32:
 *    - Apaga toda a particao NVS (Preferences, dados salvos)
 *    - Apaga as credenciais de WiFi armazenadas pelo SDK
 *
 *  Sinalizacao por LED (mesma pinagem do firmware):
 *    - Durante o processo .... os 3 LEDs piscam juntos, devagar
 *    - Sucesso ............... pisca rapido em sequencia (varredura), em loop
 *    - Falha ................. todos os LEDs acendem fixos
 *
 *  Acompanhe tambem o Serial Monitor a 115200 baud.
 *
 *  ATENCAO: este sketch e destrutivo. Apos rodar, regrave o
 *  AquaSense.ino para voltar a operacao normal.
 * ============================================================
 */

#include <Arduino.h>
#include <WiFi.h>
#include <nvs_flash.h>

// Mesma pinagem do firmware principal.
#define PIN_LED_PH     4
#define PIN_LED_WIFI   5
#define PIN_LED_ORP    18
#define PIN_LED_COND   19

const uint8_t LEDS[] = { PIN_LED_PH, PIN_LED_ORP, PIN_LED_COND, PIN_LED_WIFI };
const uint8_t N_LEDS = sizeof(LEDS) / sizeof(LEDS[0]);

void setTodosLEDs(uint8_t estado) {
  for (uint8_t i = 0; i < N_LEDS; i++) {
    digitalWrite(LEDS[i], estado);
  }
}

void piscarTodos(uint8_t vezes, unsigned long ms) {
  for (uint8_t v = 0; v < vezes; v++) {
    setTodosLEDs(HIGH);
    delay(ms);
    setTodosLEDs(LOW);
    delay(ms);
  }
}

// Indica sucesso: varredura continua dos LEDs (efeito "Knight Rider").
void loopSucesso() {
  for (uint8_t i = 0; i < N_LEDS; i++) {
    digitalWrite(LEDS[i], HIGH);
    delay(120);
    digitalWrite(LEDS[i], LOW);
  }
}

// Indica falha: todos acesos fixos.
void loopFalha() {
  setTodosLEDs(HIGH);
  delay(1000);
}

bool g_sucesso = false;

void setup() {
  Serial.begin(115200);
  delay(300);

  Serial.println();
  Serial.println(F("=========================================="));
  Serial.println(F(" AquaSense IoT - APAGAR MEMORIA (NVS/WiFi)"));
  Serial.println(F("=========================================="));

  for (uint8_t i = 0; i < N_LEDS; i++) {
    pinMode(LEDS[i], OUTPUT);
    digitalWrite(LEDS[i], LOW);
  }

  // Sinaliza "trabalhando": piscadas lentas.
  Serial.println(F("[MEM] Iniciando limpeza..."));
  piscarTodos(3, 300);

  bool ok = true;

  // 1) Apaga a particao NVS inteira e reinicializa.
  Serial.print(F("[NVS] Apagando particao NVS... "));
  esp_err_t err = nvs_flash_erase();
  if (err == ESP_OK) {
    Serial.println(F("OK"));
  } else {
    Serial.print(F("FALHOU (err="));
    Serial.print(err);
    Serial.println(F(")"));
    ok = false;
  }

  Serial.print(F("[NVS] Reinicializando NVS... "));
  err = nvs_flash_init();
  if (err == ESP_OK) {
    Serial.println(F("OK"));
  } else {
    Serial.print(F("FALHOU (err="));
    Serial.print(err);
    Serial.println(F(")"));
    ok = false;
  }

  // 2) Apaga as credenciais de WiFi guardadas pelo SDK.
  Serial.print(F("[WiFi] Apagando credenciais salvas... "));
  WiFi.mode(WIFI_STA);
  WiFi.persistent(true);
  bool wifiOk = WiFi.disconnect(true, true);  // wifioff=true, eraseap=true
  WiFi.persistent(false);
  Serial.println(wifiOk ? F("OK") : F("(nada a apagar)"));

  g_sucesso = ok;

  if (g_sucesso) {
    Serial.println(F("[MEM] Limpeza concluida com SUCESSO."));
    Serial.println(F("[MEM] Regrave o AquaSense.ino para voltar a operar."));
  } else {
    Serial.println(F("[MEM] Limpeza terminou com ERRO. Veja os codigos acima."));
  }

  Serial.println(F("=========================================="));
}

void loop() {
  if (g_sucesso) {
    loopSucesso();
  } else {
    loopFalha();
  }
}
