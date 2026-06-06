# ferramentas/ — Utilitários de manutenção do ESP32

Sketches Arduino auxiliares, **separados** do firmware principal (`../AquaSense/AquaSense.ino`).

## BlinkLimpaMemoria/

`BlinkLimpaMemoria/BlinkLimpaMemoria.ino` — sketch mínimo que **sobrescreve o firmware atual** por
um programa inerte: faz **um único blink** no LED onboard (GPIO 2) e depois fica parado para sempre.

**Quando usar**

- Confirmar que o ciclo de upload funciona antes de regravar o `AquaSense.ino`.
- Interromper um firmware preso em loop infinito sem apagar a flash/NVS inteira.

**Como usar**

1. Abra `BlinkLimpaMemoria/BlinkLimpaMemoria.ino` no Arduino IDE (a pasta tem o mesmo nome do
   sketch, como o IDE exige).
2. Selecione *ESP32 Dev Module* e faça o **Upload**.
3. Para voltar à operação normal, **regrave o `AquaSense.ino`**.

> **Não apaga a NVS.** Para zerar dados persistidos e credenciais de Wi-Fi, use a opção
> **Erase Flash** da IDE/Arduino CLI ou `esptool.py erase_flash`.
