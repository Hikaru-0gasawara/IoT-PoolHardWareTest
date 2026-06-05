// ============================================================================
//  BlinkLimpaMemoria - ESP32
// ----------------------------------------------------------------------------
//  Use este sketch temporario para sobrescrever o firmware atual do ESP32.
//  Ele faz APENAS UM blink no LED e depois fica parado para sempre.
//
//  Observacao: isso substitui o programa gravado na flash, mas nao apaga
//  obrigatoriamente toda a flash/NVS. Para apagar tudo, use a opcao
//  "Erase Flash" da IDE/Arduino CLI ou esptool.py erase_flash.
// ============================================================================

#ifndef LED_BUILTIN
  // Na maioria dos DevKits ESP32, o LED onboard fica no GPIO 2.
  #define LED_BUILTIN 2
#endif

const unsigned long TEMPO_BLINK_MS = 500;

void setup() {
  pinMode(LED_BUILTIN, OUTPUT);

  // Apenas um blink.
  digitalWrite(LED_BUILTIN, HIGH);
  delay(TEMPO_BLINK_MS);
  digitalWrite(LED_BUILTIN, LOW);
}

void loop() {
  // Nao faz mais nada depois do primeiro blink.
}
