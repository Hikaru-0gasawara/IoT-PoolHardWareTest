# wokwi/ — Firmware experimental (MicroPython / Wokwi)

`main.py` — versão **experimental** do firmware AquaSense em **MicroPython**, pensada para rodar no
simulador **[Wokwi](https://wokwi.com/)** (ESP32). É mais completa que o `AquaSense.ino` em alguns
pontos (controladores de **dosagem** com travas, **parada de emergência**, telemetria de saúde) e
serviu de base para a definição do protocolo PT.

## O que faz

- Lê (simulados) pH, ORP, condutividade, temperaturas (DS18B20) e umidade (DHT22).
- Publica o payload consolidado `aquasense-ibmec-pt/dados` + tópicos granulares, `sistema/saude`
  (a cada 60 s) e `controle/estado`.
- Recebe `controle/modo` e `dosagem/comando`; aplica travas de segurança: **tempo morto**, limites
  por **hora/dia**, **intertravamento pH↔cloro** e **parada de emergência**.
- Aciona a bomba do coletor por histerese ΔT (liga ≥ 5 °C, desliga ≤ 1 °C, anti-cycling 60 s).

## Como rodar no Wokwi

1. Crie um projeto **ESP32 + MicroPython** em [wokwi.com](https://wokwi.com/).
2. Cole o conteúdo de `main.py`.
3. A rede `Wokwi-GUEST` e o broker público `broker.hivemq.com:1883` já vêm configurados.
4. Rode — o `dashboard-app/` (ou a skill Alexa) apontados para `aquasense-ibmec-pt` recebem a
   telemetria em tempo real.

## Relação com o firmware oficial

| | `AquaSense/AquaSense.ino` | `wokwi/main.py` |
|---|---|---|
| Linguagem | C++ (Arduino) | MicroPython |
| Status | **Oficial** (hardware real) | Experimental (simulação) |
| Namespace | `aquasense-ibmec-pt` | `aquasense-ibmec-pt` |
| Dosagem com travas | simplificada | completa (tempo morto, limites, intertravamento) |

> Use o Wokwi para validar protocolo e lógica sem hardware; grave o `AquaSense.ino` na placa física
> para a operação real.
