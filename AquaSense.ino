// ============================================================================
//  AquaSense IoT - ESP32  |  v3.1  (protocolo PT — dashboard-app)
//  Monitoramento de qualidade da agua + controle de bomba do coletor solar
//  IBMEC Sao Paulo / Invivio Tecnologia Ltda
//  Prof. Marcel Stefan Wagner, PhD
// ----------------------------------------------------------------------------
//  Este firmware fala o MESMO protocolo do dashboard React em /dashboard-app:
//    - Namespace MQTT: "aquasense-ibmec-pt"
//    - Topico consolidado (fonte de verdade da UI): ".../dados" (JSON flat)
//    - Topicos granulares informativos + saude + estado de controle
//    - Recebe comandos do dashboard: ".../controle/modo" e ".../dosagem/comando"
//
//  NOVO em v3.1 — alinhamento com o dashboard que exibe pH / ORP / condutividade:
//    - Adiciona leitura de CONDUTIVIDADE (uS/cm) e o campo "condutividade_us_cm"
//      no payload consolidado. O dashboard EXIGE este campo (Zod) — sem ele,
//      todo o payload e rejeitado e a UI cai na simulacao local.
//    - O cloro livre passa a ser DERIVADO do ORP+pH (equacao de Nernst
//      simplificada) e a alcalinidade DERIVADA da condutividade. Esses valores
//      continuam alimentando LCD, topicos granulares e a skill Alexa.
//
//  GOTCHA #1 - Broker: o dashboard conecta em broker.hivemq.com:8884 (WSS).
//    Para os dois conversarem, o ESP32 precisa estar no MESMO broker.
//    USAR_TLS 0 => broker.hivemq.com:1883 (publico, casa com o dashboard).
//    USAR_TLS 1 => HiveMQ Cloud (TLS 8883); neste caso ajuste tambem o
//    MQTT_URL do dashboard (src/providers/MqttProvider.tsx) para o seu cluster.
//  GOTCHA #2 - ESP32 so fala Wi-Fi 2.4 GHz. Rede 5G nao conecta.
//  GOTCHA #3 - ".../dados" e ".../sistema/status" sao publicados com
//    retain=true: quem assinar depois recebe o ultimo estado imediatamente.
// ----------------------------------------------------------------------------
//  Mapeamento de pinos:
//     D4  -> LED 1   (pH fora da faixa)
//     D5  -> LED Wi-Fi (status da conexao)
//     D18 -> LED 2   (ORP fora da faixa — poder sanitizante)
//     D19 -> LED 3   (condutividade fora da faixa)
//     D21 -> LCD SDA (I2C)
//     D22 -> LCD SCL (I2C)
//     D26 -> Rele    (bomba do coletor solar)
// ============================================================================

#define USAR_TLS 0   // 0 = broker publico (broker.hivemq.com, casa com o dashboard) | 1 = HiveMQ Cloud TLS 8883

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
#define PIN_LED_CLORO  18
#define PIN_LED_ALC    19
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
//  LCD I2C 16x2 — endereco detectado no boot
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
  const char* MQTT_HOST = "5b98faa6560246759f3065ffc720f8b9.s1.eu.hivemq.cloud";
  const int   MQTT_PORT = 8883;
  const char* MQTT_USER = "ProjetoIoT";
  const char* MQTT_PASS = "IoT12345678";
#else
  // Broker publico de teste: sem TLS e sem autenticacao. Mesmo broker do dashboard.
  const char* MQTT_HOST = "broker.hivemq.com";
  const int   MQTT_PORT = 1883;
  const char* MQTT_USER = "";
  const char* MQTT_PASS = "";
#endif

// ----------------------------------------------------------------------------
//  TOPICOS — namespace PT, identico ao src/lib/mqttTopics.ts do dashboard.
// ----------------------------------------------------------------------------
#define NS "aquasense-ibmec-pt"

const char* TOPIC_DADOS          = NS "/dados";                 // consolidado (fonte de verdade)
const char* TOPIC_PISC_PH        = NS "/piscina/ph";
const char* TOPIC_PISC_CLORO     = NS "/piscina/cloro";
const char* TOPIC_PISC_ALC       = NS "/piscina/alcalinidade";
const char* TOPIC_PISC_COND      = NS "/piscina/condutividade";
const char* TOPIC_PISC_TEMP      = NS "/piscina/temperatura";
const char* TOPIC_COLE_TEMP      = NS "/coletor/temperatura";
const char* TOPIC_COLE_BOMBA     = NS "/coletor/bomba";
const char* TOPIC_SIS_ALERTAS    = NS "/sistema/alertas";
const char* TOPIC_SIS_STATUS     = NS "/sistema/status";        // LWT online/offline (retain)
const char* TOPIC_SIS_SAUDE      = NS "/sistema/saude";         // telemetria 60s
const char* TOPIC_CTRL_ESTADO    = NS "/controle/estado";       // retain
const char* TOPIC_DOS_EVENTO     = NS "/dosagem/evento";
// Recebidos do dashboard:
const char* TOPIC_CTRL_MODO_IN   = NS "/controle/modo";
const char* TOPIC_DOS_CMD_IN     = NS "/dosagem/comando";

#if USAR_TLS
  WiFiClientSecure wifiClient;
#else
  WiFiClient       wifiClient;
#endif
PubSubClient     mqtt(wifiClient);

bool mqttHabilitado = false;
char clientId[24];

// ============================================================================
//  PARAMETROS DE OPERACAO
// ============================================================================
const unsigned long INTERVALO_AQUISICAO_MS = 5000;
const unsigned long INTERVALO_SAUDE_MS     = 60000UL;
const float         DELTA_LIGAR_C          = 5.0f;
const float         DELTA_DESLIGAR_C       = 1.0f;
const unsigned long ANTI_CYCLING_MS        = 60000UL;
const unsigned long DOSE_DURACAO_MS        = 8000UL;   // duracao simulada de uma dosagem

// Faixas ideais — mesmas do dashboard (thresholds.ts).
// O dashboard v2.0 exibe pH / ORP / condutividade; LEDs e alertas seguem essas faixas.
const float PH_MIN   = 7.2f,   PH_MAX   = 7.6f;     // ABNT NBR 10818
const float ORP_MIN  = 650.0f, ORP_MAX  = 750.0f;   // mV — poder sanitizante
const float COND_MIN = 800.0f, COND_MAX = 1500.0f;  // uS/cm — solidos dissolvidos
// Faixas dos valores DERIVADos (cloro/alcalinidade) — usadas no LCD e Alexa.
const float CLORO_MIN = 1.0f,  CLORO_MAX = 3.0f;    // ppm
const float ALC_MIN  = 80.0f,  ALC_MAX  = 120.0f;   // ppm CaCO3

const unsigned long WIFI_RETRY_MS = 10000UL;
const unsigned long MQTT_RETRY_MS = 5000UL;

// ============================================================================
//  ESTADO GLOBAL
// ============================================================================
unsigned long ultimaAquisicao    = 0;
unsigned long ultimaSaude        = 0;
unsigned long ultimaMudancaBomba = 0;
unsigned long proxRetryWiFi      = 0;
unsigned long proxRetryMQTT      = 0;
unsigned long fimDosagem         = 0;        // 0 = sem dosagem em andamento
uint32_t      ciclo              = 0;
bool          bombaLigada        = false;
bool          primeiroCiclo      = true;

// Leituras atuais.
static float g_ph     = 7.4f;
static float g_orp    = 700.0f;    // mV  — sensor (sanitizacao)
static float g_cond   = 1000.0f;   // uS/cm — sensor (solidos dissolvidos)
static float g_cloro  = 2.0f;      // ppm — DERIVADO de ORP+pH
static float g_alc    = 100.0f;    // ppm — DERIVADO da condutividade
static float g_tPisc  = 28.0f;
static float g_tSolar = 30.0f;
static float g_umid   = 65.0f;

// Estado de controle (espelha controle/estado).
char g_modo[12]           = "automatico";   // "automatico" | "manual" | "parada"
bool g_paradaEmergencia   = false;
char g_doseEmAndamento[8] = "";              // "" = null | "cloro" | "acido" | "base"

// ============================================================================
//  SIMULACAO DOS SENSORES (literais float — sem promocao a double)
//  Em hardware real, troque estas funcoes pela leitura analogica calibrada.
// ============================================================================
float lerPH()            { return 7.4f   + sinf(millis() / 30000.0f) * 0.2f;   }  // 7.2 – 7.6
float lerORP()           { return 700.0f + sinf(millis() / 25000.0f) * 60.0f;  }  // 640 – 760 mV
float lerCondutividade() { return 1000.0f+ sinf(millis() / 40000.0f) * 180.0f; }  // 820 – 1180 uS/cm
float lerTempPiscina()   { return 28.0f  + sinf(millis() / 60000.0f) * 2.0f;   }
float lerTempSolar()     { return 30.0f  + sinf(millis() / 45000.0f) * 9.0f;   }
float lerUmidade()       { return 65.0f  + sinf(millis() / 50000.0f) * 10.0f;  }

// ----------------------------------------------------------------------------
//  CONVERSOES FISICO-QUIMICAS (derivam grandezas exibidas a partir dos sensores)
// ----------------------------------------------------------------------------

// Cloro livre (ppm) a partir do ORP (mV) corrigido pelo pH.
// Nernst simplificada: cada unidade de pH desloca o ORP efetivo em ~59,16 mV.
// Calibrado para ORP 700 mV @ pH 7,4 -> ~2,0 ppm (faixa ideal ABNT 1,0–3,0).
float calcularCloroLivre(float orp_mv, float ph) {
  float orp_eff = orp_mv - (ph - 7.0f) * 59.16f;
  float cl = 2.0f * powf(10.0f, (orp_eff - 676.0f) / 284.0f);
  if (cl < 0.05f) return 0.05f;
  if (cl > 15.0f) return 15.0f;
  return cl;
}

// Alcalinidade total (ppm CaCO3) a partir da condutividade (uS/cm).
// Razao empirica 0,10 (bicarbonato domina a condutividade da agua de piscina):
// 1000 uS/cm -> ~100 ppm. Valida na faixa 700–1400 uS/cm.
float calcularAlcalinidade(float cond_us_cm) {
  float alc = cond_us_cm * 0.10f;
  if (alc < 0.0f)   return 0.0f;
  if (alc > 500.0f) return 500.0f;
  return alc;
}

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

// Extrai o valor string de uma chave JSON simples ("chave":"valor").
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

// ----------------------------------------------------------------------------
//  ALERTAS — array JSON de strings (PT), mesmas labels que a UI exibe.
// ----------------------------------------------------------------------------
static int buildAlertas(char* buf, size_t len) {
  size_t pos = 0;
  int n = 0;
  buf[pos++] = '[';
  buf[pos]   = '\0';

  auto append = [&](const char* s) {
    size_t disp = len - pos - 1;
    size_t k = strlen(s);
    if (k > disp) k = disp;
    memcpy(buf + pos, s, k);
    pos += k;
    buf[pos] = '\0';
  };

  // Alertas seguem os parametros exibidos pelo dashboard: pH, ORP, condutividade.
  if (foraDaFaixa(g_ph, PH_MIN, PH_MAX)) {
    if (n) append(",");
    append("\"pH fora da faixa\"");
    n++;
  }
  if (foraDaFaixa(g_orp, ORP_MIN, ORP_MAX)) {
    if (n) append(",");
    append("\"ORP fora da faixa\"");
    n++;
  }
  if (foraDaFaixa(g_cond, COND_MIN, COND_MAX)) {
    if (n) append(",");
    append("\"Condutividade fora da faixa\"");
    n++;
  }

  append("]");
  return n;
}

// ----------------------------------------------------------------------------
//  PUBLICACOES PT
// ----------------------------------------------------------------------------

// Topico consolidado ".../dados" — fonte de verdade do dashboard.
static void publicarDados() {
  if (!mqtt.connected()) return;

  char alertas[160];
  buildAlertas(alertas, sizeof(alertas));

  const float deltaT = g_tSolar - g_tPisc;

  // dose_em_andamento: null quando vazio, senao string entre aspas.
  char dose[16];
  if (g_doseEmAndamento[0] == '\0') {
    snprintf(dose, sizeof(dose), "null");
  } else {
    snprintf(dose, sizeof(dose), "\"%s\"", g_doseEmAndamento);
  }

  char payload[480];
  snprintf(payload, sizeof(payload),
    "{\"projeto\":\"AquaSense IoT\",\"ciclo\":%lu,"
    "\"ph\":%.2f,\"orp_mv\":%.1f,\"cloro\":%.2f,\"alcalinidade\":%.1f,"
    "\"condutividade_us_cm\":%.1f,"
    "\"temp_piscina\":%.1f,\"temp_coletor\":%.1f,\"delta_t\":%.1f,\"umidade\":%.1f,"
    "\"bomba\":\"%s\",\"alertas\":%s,"
    "\"modo\":\"%s\",\"parada_emergencia\":%s,\"dose_em_andamento\":%s}",
    (unsigned long)ciclo,
    g_ph, g_orp, g_cloro, g_alc,
    g_cond,
    g_tPisc, g_tSolar, deltaT, g_umid,
    bombaLigada ? "LIGADA" : "DESLIGADA", alertas,
    g_modo, g_paradaEmergencia ? "true" : "false", dose);

  bool ok = mqtt.publish(TOPIC_DADOS, (const uint8_t*)payload, strlen(payload), true);
  logPublish(TOPIC_DADOS, ok);
}

// Topicos granulares (informativos no log do dashboard).
static void publicarFloat(const char* topico, float valor, uint8_t casas) {
  if (!mqtt.connected()) return;
  char buf[16];
  dtostrf(valor, 1, casas, buf);
  mqtt.publish(topico, buf, true);
}

static void publicarGranulares() {
  publicarFloat(TOPIC_PISC_PH,   g_ph,    2);
  publicarFloat(TOPIC_PISC_CLORO,g_cloro, 2);
  publicarFloat(TOPIC_PISC_ALC,  g_alc,   1);
  publicarFloat(TOPIC_PISC_COND, g_cond,  1);
  publicarFloat(TOPIC_PISC_TEMP, g_tPisc, 1);
  publicarFloat(TOPIC_COLE_TEMP, g_tSolar,1);
  if (mqtt.connected()) {
    mqtt.publish(TOPIC_COLE_BOMBA, bombaLigada ? "LIGADA" : "DESLIGADA", true);
    char alertas[160];
    buildAlertas(alertas, sizeof(alertas));
    mqtt.publish(TOPIC_SIS_ALERTAS, alertas, true);
  }
}

// Estado de controle (retain) — chega imediato apos subscribe do dashboard.
static void publicarControleEstado() {
  if (!mqtt.connected()) return;
  char dose[16];
  if (g_doseEmAndamento[0] == '\0') snprintf(dose, sizeof(dose), "null");
  else snprintf(dose, sizeof(dose), "\"%s\"", g_doseEmAndamento);

  char payload[128];
  snprintf(payload, sizeof(payload),
    "{\"modo\":\"%s\",\"parada_emergencia\":%s,\"dose_em_andamento\":%s}",
    g_modo, g_paradaEmergencia ? "true" : "false", dose);
  logPublish(TOPIC_CTRL_ESTADO, mqtt.publish(TOPIC_CTRL_ESTADO, payload, true));
}

// Telemetria tecnica (60s).
static void publicarSaude() {
  if (!mqtt.connected()) return;
  char payload[200];
  long rssi = (WiFi.status() == WL_CONNECTED) ? WiFi.RSSI() : 0;
  snprintf(payload, sizeof(payload),
    "{\"tempo_ativo_s\":%lu,\"heap_livre_kb\":%lu,\"rssi_wifi_dbm\":%ld,"
    "\"erros_dht\":0,\"erros_ds\":0,\"falhas_mqtt\":0}",
    (unsigned long)(millis() / 1000UL),
    (unsigned long)(ESP.getFreeHeap() / 1024UL),
    rssi);
  logPublish(TOPIC_SIS_SAUDE, mqtt.publish(TOPIC_SIS_SAUDE, payload, true));
}

// Evento de dosagem (iniciada / concluida / bloqueada).
static void publicarEventoDosagem(const char* parametro, const char* evento,
                                  const char* motivo, const char* fonte) {
  if (!mqtt.connected()) return;
  char payload[200];
  if (motivo && motivo[0]) {
    snprintf(payload, sizeof(payload),
      "{\"parametro\":\"%s\",\"evento\":\"%s\",\"motivo\":\"%s\",\"fonte\":\"%s\"}",
      parametro, evento, motivo, fonte);
  } else {
    snprintf(payload, sizeof(payload),
      "{\"parametro\":\"%s\",\"evento\":\"%s\",\"fonte\":\"%s\"}",
      parametro, evento, fonte);
  }
  logPublish(TOPIC_DOS_EVENTO, mqtt.publish(TOPIC_DOS_EVENTO, payload));
}

// ----------------------------------------------------------------------------
//  CALLBACK — comandos vindos do dashboard.
// ----------------------------------------------------------------------------
static void mqttCallback(char* topic, byte* payload, unsigned int length) {
  if (length == 0 || length > 399) return;
  char msg[400];
  memcpy(msg, payload, length);
  msg[length] = '\0';

  // controle/modo: {"modo":"automatico"|"manual"|"parada"}
  if (strcmp(topic, TOPIC_CTRL_MODO_IN) == 0) {
    char modo[12] = "";
    if (!extrairStringJSON(msg, "modo", modo, sizeof(modo))) return;
    if (strcmp(modo, "automatico") != 0 &&
        strcmp(modo, "manual") != 0 &&
        strcmp(modo, "parada") != 0) return;
    snprintf(g_modo, sizeof(g_modo), "%s", modo);
    g_paradaEmergencia = (strcmp(modo, "parada") == 0);
    Serial.print(F("[CTRL] modo -> ")); Serial.println(g_modo);
    publicarControleEstado();
    return;
  }

  // dosagem/comando: {"parametro":"cloro"|"acido"|"base"}
  if (strcmp(topic, TOPIC_DOS_CMD_IN) == 0) {
    char param[8] = "";
    if (!extrairStringJSON(msg, "parametro", param, sizeof(param))) return;
    if (strcmp(param, "cloro") != 0 &&
        strcmp(param, "acido") != 0 &&
        strcmp(param, "base") != 0) return;

    // Camadas de seguranca minimas: E-Stop e dose ja em andamento.
    if (g_paradaEmergencia) {
      publicarEventoDosagem(param, "bloqueada", "parada de emergencia ativa", "manual");
      return;
    }
    if (g_doseEmAndamento[0] != '\0') {
      publicarEventoDosagem(param, "bloqueada", "outra dose em andamento", "manual");
      return;
    }

    snprintf(g_doseEmAndamento, sizeof(g_doseEmAndamento), "%s", param);
    fimDosagem = millis() + DOSE_DURACAO_MS;
    publicarEventoDosagem(param, "iniciada", "comando do operador", "manual");
    publicarControleEstado();
    Serial.print(F("[DOSE] iniciada: ")); Serial.println(param);
    return;
  }
}

// ----------------------------------------------------------------------------
//  LEDs / BOMBA
// ----------------------------------------------------------------------------
void atualizarLEDs() {
  // LEDs seguem os parametros do dashboard: pH, ORP, condutividade.
  digitalWrite(PIN_LED_PH,    foraDaFaixa(g_ph,   PH_MIN,   PH_MAX)   ? HIGH : LOW);
  digitalWrite(PIN_LED_CLORO, foraDaFaixa(g_orp,  ORP_MIN,  ORP_MAX)  ? HIGH : LOW);
  digitalWrite(PIN_LED_ALC,   foraDaFaixa(g_cond, COND_MIN, COND_MAX) ? HIGH : LOW);
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

// ----------------------------------------------------------------------------
//  LCD
// ----------------------------------------------------------------------------
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

void atualizarLCD() {
  if (!lcdOK || lcd == nullptr) return;
  static bool tela = false;
  tela = !tela;

  char l1[17], l2[17];
  if (!tela) {
    snprintf(l1, sizeof(l1), "pH%.2f ORP%d", g_ph, (int)g_orp);
    snprintf(l2, sizeof(l2), "Cnd%d B:%s", (int)g_cond, bombaLigada ? "ON" : "OFF");
  } else {
    snprintf(l1, sizeof(l1), "Tp:%.1f%cC", g_tPisc, (char)223);
    snprintf(l2, sizeof(l2), "Ts:%.1f%cC %s", g_tSolar, (char)223, bombaLigada ? "ON" : "OFF");
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
    if (Wire.endTransmission() == 0) { addr = a; break; }
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

// ----------------------------------------------------------------------------
//  WI-FI
// ----------------------------------------------------------------------------
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

// ----------------------------------------------------------------------------
//  MQTT
// ----------------------------------------------------------------------------
void iniciarMQTT() {
  if (!mqttHabilitado) {
    Serial.println(F("[MQTT] DESABILITADO - host/credenciais sao placeholders."));
    return;
  }
#if USAR_TLS
  wifiClient.setInsecure();   // prototipo; em producao use setCACert(...)
#endif

  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setBufferSize(768);
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
  if (mqtt.connected()) { mqtt.loop(); return; }

  const unsigned long agora = millis();
  if (agora < proxRetryMQTT) return;
  proxRetryMQTT = agora + MQTT_RETRY_MS;

  Serial.print(F("[MQTT] conectando a "));
  Serial.print(MQTT_HOST);
  Serial.print(':');
  Serial.print(MQTT_PORT);
  Serial.print(F(" ... "));

  bool ok;
  if (strlen(MQTT_USER) > 0) {
    ok = mqtt.connect(clientId, MQTT_USER, MQTT_PASS, TOPIC_SIS_STATUS, 1, true, "offline");
  } else {
    ok = mqtt.connect(clientId, TOPIC_SIS_STATUS, 1, true, "offline");
  }

  if (ok) {
    Serial.println(F("OK"));
    logPublish(TOPIC_SIS_STATUS, mqtt.publish(TOPIC_SIS_STATUS, "online", true));
    bool s1 = mqtt.subscribe(TOPIC_CTRL_MODO_IN);
    bool s2 = mqtt.subscribe(TOPIC_DOS_CMD_IN);
    Serial.print(F("[MQTT] subscribe controle/modo="));
    Serial.print(s1 ? F("OK") : F("FALHOU"));
    Serial.print(F(" dosagem/comando="));
    Serial.println(s2 ? F("OK") : F("FALHOU"));
    publicarControleEstado();   // retain inicial
    publicarSaude();
    ultimaSaude = millis();
  } else {
    int rc = mqtt.state();
    Serial.print(F("falhou rc="));
    Serial.print(rc);
    Serial.print(F(" -> "));
    Serial.println(mqttRcToStr(rc));
  }
}

// ----------------------------------------------------------------------------
//  TESTE DE LEDs
// ----------------------------------------------------------------------------
void blinkTesteLEDs() {
  const uint8_t leds[] = { PIN_LED_PH, PIN_LED_CLORO, PIN_LED_ALC };
  for (int r = 0; r < 2; r++)
    for (int i = 0; i < 3; i++) {
      digitalWrite(leds[i], HIGH);
      delay(150);
      digitalWrite(leds[i], LOW);
    }
}

// ============================================================================
//  SETUP
// ============================================================================
void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println(F("\n=== AquaSense IoT - boot v3.1 (protocolo PT) ==="));

  pinMode(PIN_LED_PH,    OUTPUT);
  pinMode(PIN_LED_CLORO, OUTPUT);
  pinMode(PIN_LED_ALC,   OUTPUT);
  pinMode(PIN_LED_WIFI,  OUTPUT);
  pinMode(PIN_RELE,      OUTPUT);
  digitalWrite(PIN_LED_PH,    LOW);
  digitalWrite(PIN_LED_CLORO, LOW);
  digitalWrite(PIN_LED_ALC,   LOW);
  digitalWrite(PIN_LED_WIFI,  LOW);
  digitalWrite(PIN_RELE, RELE_DESLIGA);

  Wire.begin(PIN_SDA, PIN_SCL);
  Wire.setClock(I2C_CLOCK_HZ);
  delay(100);

  lcdOK = inicializarLCD();
  if (!lcdOK) Serial.println(F("[LCD] sem display"));

  blinkTesteLEDs();

  mqttHabilitado = strlen(MQTT_HOST) > 0;
#if USAR_TLS
  mqttHabilitado = mqttHabilitado && strlen(MQTT_USER) > 0 && strlen(MQTT_PASS) > 0;
#endif

  Serial.println(F("---------------------------------------------"));
#if USAR_TLS
  Serial.println(F("[MODO]   HiveMQ Cloud (TLS, porta 8883)"));
#else
  Serial.println(F("[MODO]   Broker PUBLICO (broker.hivemq.com) — casa com o dashboard"));
#endif
  Serial.print(F("[BROKER] "));
  Serial.print(MQTT_HOST);
  Serial.print(':');
  Serial.println(MQTT_PORT);
  Serial.print(F("[NS]     "));
  Serial.println(NS);
  Serial.print(F("[MQTT]   habilitado: "));
  Serial.println(mqttHabilitado ? F("SIM") : F("NAO"));
  if (strcmp(WIFI_SSID, "SUA_REDE_WIFI") == 0)
    Serial.println(F("[AVISO]  WIFI_SSID ainda e placeholder - edite WIFI_SSID/WIFI_PASS."));
  Serial.println(F("---------------------------------------------"));

  iniciarWiFi();
  iniciarMQTT();

  if (lcdOK) { delay(1500); lcd->clear(); }

  ultimaAquisicao = millis() - INTERVALO_AQUISICAO_MS;
  ultimaSaude     = millis();
}

// ============================================================================
//  LOOP
// ============================================================================
void loop() {
  gerenciarWiFi();
  gerenciarMQTT();

  const unsigned long agora = millis();

  // Encerra dosagem simulada quando o tempo expira.
  if (fimDosagem != 0 && agora >= fimDosagem) {
    publicarEventoDosagem(g_doseEmAndamento, "concluida", "", "automatico");
    Serial.print(F("[DOSE] concluida: ")); Serial.println(g_doseEmAndamento);
    g_doseEmAndamento[0] = '\0';
    fimDosagem = 0;
    publicarControleEstado();
  }

  // Telemetria de saude (60s).
  if (agora - ultimaSaude >= INTERVALO_SAUDE_MS) {
    ultimaSaude = agora;
    publicarSaude();
  }

  if (agora - ultimaAquisicao < INTERVALO_AQUISICAO_MS) return;
  ultimaAquisicao = agora;
  ciclo++;

  g_ph     = lerPH();
  g_orp    = lerORP();
  g_cond   = lerCondutividade();
  g_cloro  = calcularCloroLivre(g_orp, g_ph);   // derivado de ORP+pH
  g_alc    = calcularAlcalinidade(g_cond);      // derivado da condutividade
  g_tPisc  = lerTempPiscina();
  g_tSolar = lerTempSolar();
  g_umid   = lerUmidade();

  atualizarLEDs();
  controlarBomba(g_tPisc, g_tSolar);
  atualizarLCD();

  Serial.print(F("c="));      Serial.print(ciclo);
  Serial.print(F(" pH="));    Serial.print(g_ph, 2);
  Serial.print(F(" ORP="));   Serial.print(g_orp, 0);
  Serial.print(F(" Cond="));  Serial.print(g_cond, 0);
  Serial.print(F(" Cl="));    Serial.print(g_cloro, 2);
  Serial.print(F(" Alc="));   Serial.print(g_alc, 0);
  Serial.print(F(" Tp="));    Serial.print(g_tPisc, 1);
  Serial.print(F(" Ts="));    Serial.print(g_tSolar, 1);
  Serial.print(F(" dT="));    Serial.print(g_tSolar - g_tPisc, 1);
  Serial.print(F(" Um="));    Serial.print(g_umid, 0);
  Serial.print(F(" B="));     Serial.print(bombaLigada ? "ON" : "OFF");
  Serial.print(F(" modo="));  Serial.print(g_modo);
  Serial.print(F(" WiFi="));  Serial.print(WiFi.status() == WL_CONNECTED ? "OK" : "OFF");
  Serial.print(F(" MQTT="));  Serial.println(mqtt.connected() ? "OK" : "OFF");

  publicarGranulares();
  publicarDados();
}
