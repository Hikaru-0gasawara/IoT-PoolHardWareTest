import network
import time
import gc
from machine import Pin, ADC
import dht
import onewire
import ds18x20
import ujson
from umqtt.simple import MQTTClient

WIFI_SSID = "Wokwi-GUEST"
WIFI_SENHA = ""

MQTT_BROKER     = "broker.hivemq.com"
MQTT_PORTA      = 1883
MQTT_USUARIO    = ""
MQTT_SENHA_MQ   = ""
MQTT_KEEPALIVE  = 60
MQTT_NAMESPACE  = "aquasense-ibmec-pt"
MQTT_CLIENTE_ID = "aquasense-esp32-ibmec-pt-v4-1"

PIN_NTC_PH      = 34
PIN_LDR_ORP     = 33
PIN_MQ2_COND    = 36
PIN_DHT22       = 15
PIN_DS18B20     = 4

PIN_LED_BOMBA   = 26
PIN_LED_STATUS  = 27

PIN_DOSADOR_CLORO       = 25
PIN_DOSADOR_ACIDO       = 32
PIN_DOSADOR_BASE        = 14
PIN_PARADA_EMERGENCIA   = 13

PH_MIN, PH_MAX                     = 7.2, 7.6
CLORO_MIN, CLORO_MAX               = 1.0, 3.0
ALC_MIN, ALC_MAX                   = 80.0, 120.0
TEMP_PISCINA_MIN, TEMP_PISCINA_MAX = 26.0, 30.0

DELTA_T_LIGAR    = 5.0
DELTA_T_DESLIGAR = 1.0
ANTI_CICLO_SEG   = 60

INTERVALO_CICLO = 5
AMOSTRAS_ADC    = 10
ERRO_SENSOR     = -99.0

PULSO_DOSAGEM_SEG         = 3
PERIODO_SAUDE_SEG         = 60
HORAS_RETENCAO_HISTORICO  = 24

TEMPO_MORTO_CLORO_SEG = 30 * 60
TEMPO_MORTO_ACIDO_SEG = 30 * 60
TEMPO_MORTO_BASE_SEG  = 30 * 60

INTERTRAVAMENTO_SEG = 60

MAX_DOSES_HORA_CLORO = 2
MAX_DOSES_HORA_ACIDO = 1
MAX_DOSES_HORA_BASE  = 1

MAX_DOSES_DIA_CLORO = 8
MAX_DOSES_DIA_ACIDO = 4
MAX_DOSES_DIA_BASE  = 4

VERSAO_FIRMWARE = "4.1.0-pt-alexa"

TOPICO_PH              = MQTT_NAMESPACE + "/piscina/ph"
TOPICO_ORP             = MQTT_NAMESPACE + "/piscina/orp"
TOPICO_COND            = MQTT_NAMESPACE + "/piscina/condutividade"
TOPICO_TEMP_PISCINA    = MQTT_NAMESPACE + "/piscina/temperatura"
TOPICO_TEMP_COLETOR    = MQTT_NAMESPACE + "/coletor/temperatura"
TOPICO_BOMBA           = MQTT_NAMESPACE + "/coletor/bomba"
TOPICO_ALERTAS         = MQTT_NAMESPACE + "/sistema/alertas"
TOPICO_STATUS          = MQTT_NAMESPACE + "/sistema/status"
TOPICO_SAUDE           = MQTT_NAMESPACE + "/sistema/saude"
TOPICO_EVENTO_DOSAGEM  = MQTT_NAMESPACE + "/dosagem/evento"
TOPICO_ESTADO_CONTROLE = MQTT_NAMESPACE + "/controle/estado"
TOPICO_DADOS           = MQTT_NAMESPACE + "/dados"
TOPICO_ALEXA_SNAPSHOT  = MQTT_NAMESPACE + "/alexa/snapshot"
TOPICO_ALEXA_RESPOSTA  = MQTT_NAMESPACE + "/alexa/resposta"
TOPICO_MODO_CONTROLE   = MQTT_NAMESPACE + "/controle/modo"
TOPICO_COMANDO_DOSAGEM = MQTT_NAMESPACE + "/dosagem/comando"


def iniciar_adc(num_pino):
    adc = ADC(Pin(num_pino))
    adc.atten(ADC.ATTN_11DB)
    adc.width(ADC.WIDTH_12BIT)
    return adc


adc_ph   = iniciar_adc(PIN_NTC_PH)
adc_orp  = iniciar_adc(PIN_LDR_ORP)
adc_cond = iniciar_adc(PIN_MQ2_COND)

sensor_dht    = dht.DHT22(Pin(PIN_DHT22))
barramento_ow = onewire.OneWire(Pin(PIN_DS18B20))
sensor_ds     = ds18x20.DS18X20(barramento_ow)
ds_roms       = []

led_bomba  = Pin(PIN_LED_BOMBA, Pin.OUT)
led_status = Pin(PIN_LED_STATUS, Pin.OUT)

led_dosador_cloro = Pin(PIN_DOSADOR_CLORO, Pin.OUT)
led_dosador_acido = Pin(PIN_DOSADOR_ACIDO, Pin.OUT)
led_dosador_base  = Pin(PIN_DOSADOR_BASE, Pin.OUT)

for pino in (led_dosador_cloro, led_dosador_acido, led_dosador_base):
    pino.value(0)

btn_parada_emergencia = Pin(PIN_PARADA_EMERGENCIA, Pin.IN, Pin.PULL_UP)

erros_dht = 0
erros_ds  = 0


def ler_adc_media(adc, n=AMOSTRAS_ADC):
    total = 0
    for _ in range(n):
        total += adc.read()
        time.sleep_ms(2)
    return total / n


def adc_para_ph(bruto):
    return round((bruto / 4095.0) * 14.0, 2)


def adc_para_orp(bruto):
    orp_mv = (bruto / 4095.0) * 1000.0
    if orp_mv < 400:
        cloro = 0.0
    elif orp_mv > 900:
        cloro = 5.0
    else:
        cloro = (orp_mv - 400) / 100.0
    return round(orp_mv, 1), round(cloro, 2)


def adc_para_alcalinidade(bruto):
    return round((bruto / 4095.0) * 200.0, 1)


def ler_ds18b20():
    global erros_ds
    if not ds_roms:
        return ERRO_SENSOR
    try:
        sensor_ds.convert_temp()
        time.sleep_ms(750)
        return round(sensor_ds.read_temp(ds_roms[0]), 1)
    except Exception as e:
        erros_ds += 1
        print("  [DS18B20] {}".format(e))
        return ERRO_SENSOR


def ler_dht22():
    global erros_dht
    try:
        sensor_dht.measure()
        return sensor_dht.temperature(), sensor_dht.humidity()
    except Exception as e:
        erros_dht += 1
        print("  [DHT22] {}".format(e))
        return ERRO_SENSOR, -1.0


def temp_valida(t):
    return t > -50


class ControladorBomba:
    def __init__(self, limiar_ligar, limiar_desligar, anti_ciclo_seg):
        self.limiar_ligar    = limiar_ligar
        self.limiar_desligar = limiar_desligar
        self.anti_ciclo_ms   = anti_ciclo_seg * 1000
        self.estado          = False
        self.ultima_mudanca  = time.ticks_ms()

    def atualizar(self, temp_piscina, temp_coletor):
        if not (temp_valida(temp_piscina) and temp_valida(temp_coletor)):
            return self.estado, 0.0
        delta_t = temp_coletor - temp_piscina
        decorrido_ms = time.ticks_diff(time.ticks_ms(), self.ultima_mudanca)
        if decorrido_ms < self.anti_ciclo_ms:
            return self.estado, delta_t
        if not self.estado and delta_t >= self.limiar_ligar:
            self.estado = True
            self.ultima_mudanca = time.ticks_ms()
            print("  >>> BOMBA LIGADA (dT={:.1f})".format(delta_t))
        elif self.estado and delta_t <= self.limiar_desligar:
            self.estado = False
            self.ultima_mudanca = time.ticks_ms()
            print("  >>> BOMBA DESLIGADA (dT={:.1f})".format(delta_t))
        return self.estado, delta_t


def obter_status(valor, min_v, max_v, valido=True):
    if not valido:
        return "ERRO"
    if valor < min_v:
        return "BAIXO"
    if valor > max_v:
        return "ALTO"
    return "OK"


def verificar_alertas(ph, cloro, alc, temp_piscina):
    alertas = []
    if ph < PH_MIN:
        alertas.append("pH baixo:{:.1f}".format(ph))
    elif ph > PH_MAX:
        alertas.append("pH alto:{:.1f}".format(ph))
    if cloro < CLORO_MIN:
        alertas.append("Cl baixo:{:.1f}".format(cloro))
    elif cloro > CLORO_MAX:
        alertas.append("Cl alto:{:.1f}".format(cloro))
    if alc < ALC_MIN:
        alertas.append("Alc baixo:{:.0f}".format(alc))
    elif alc > ALC_MAX:
        alertas.append("Alc alto:{:.0f}".format(alc))
    if temp_valida(temp_piscina):
        if temp_piscina < TEMP_PISCINA_MIN:
            alertas.append("Fria:{:.1f}".format(temp_piscina))
        elif temp_piscina > TEMP_PISCINA_MAX:
            alertas.append("Quente:{:.1f}".format(temp_piscina))
    return alertas


def parada_emergencia_ativa():
    leituras = [btn_parada_emergencia.value() for _ in range(3)]
    time.sleep_ms(5)
    leituras.append(btn_parada_emergencia.value())
    return all(v == 0 for v in leituras)


_ultimo_estado_parada = [False]


def parada_emergencia_mudou():
    atual = parada_emergencia_ativa()
    mudou = atual != _ultimo_estado_parada[0]
    _ultimo_estado_parada[0] = atual
    if mudou:
        print("  [SEGURANÇA] Parada: {}".format("ATIVO" if atual else "ok"))
    return mudou


PINOS_DOSAGEM = {
    "cloro": led_dosador_cloro,
    "acido": led_dosador_acido,
    "base":  led_dosador_base,
}

TEMPOS_MORTO_SEG = {
    "cloro": TEMPO_MORTO_CLORO_SEG,
    "acido": TEMPO_MORTO_ACIDO_SEG,
    "base":  TEMPO_MORTO_BASE_SEG,
}

LIMITES_HORA = {
    "cloro": MAX_DOSES_HORA_CLORO,
    "acido": MAX_DOSES_HORA_ACIDO,
    "base":  MAX_DOSES_HORA_BASE,
}

LIMITES_DIA = {
    "cloro": MAX_DOSES_DIA_CLORO,
    "acido": MAX_DOSES_DIA_ACIDO,
    "base":  MAX_DOSES_DIA_BASE,
}


class ControladorDosagem:
    def __init__(self):
        self.modo               = "manual"
        self.dose_em_andamento  = None
        self.dose_inicio_ms     = 0
        self.dose_origem        = None
        self.dose_comando_id    = None
        self.ultima_dose_ms     = {"cloro": 0, "acido": 0, "base": 0}
        self.historico_dosagem  = []
        self.ultima_limpeza_ms  = time.ticks_ms()
        self.comando_pendente   = None
        self.eventos_pendentes  = []

    def pode_dosar(self, parametro, valor_ph, valor_cloro, fonte):
        agora = time.ticks_ms()
        if parada_emergencia_ativa():
            return False, "parada_emergencia_ativa"
        if self.modo == "parada":
            return False, "modo_parada"
        if parametro == "cloro" and valor_cloro < 0:
            return False, "erro_sensor_cloro"
        if parametro in ("acido", "base") and valor_ph < 0:
            return False, "erro_sensor_ph"
        if self.dose_em_andamento is not None:
            return False, "dose_em_andamento"
        ultimo_ms = self.ultima_dose_ms.get(parametro, 0)
        if ultimo_ms != 0:
            decorrido_s = time.ticks_diff(agora, ultimo_ms) / 1000.0
            if decorrido_s < TEMPOS_MORTO_SEG[parametro]:
                return False, "tempo_morto"
        for (t, p) in self.historico_dosagem:
            decorrido_s = time.ticks_diff(agora, t) / 1000.0
            if decorrido_s < INTERTRAVAMENTO_SEG:
                if parametro == "cloro" and p in ("acido", "base"):
                    return False, "intertravamento_ph_cloro"
                if parametro in ("acido", "base") and p == "cloro":
                    return False, "intertravamento_ph_cloro"
        if self._doses_na_janela(parametro, 3600 * 1000) >= LIMITES_HORA[parametro]:
            return False, "limite_horario"
        if self._doses_na_janela(parametro, 24 * 3600 * 1000) >= LIMITES_DIA[parametro]:
            return False, "limite_diario"
        return True, "ok"

    def _doses_na_janela(self, parametro, janela_ms):
        agora = time.ticks_ms()
        return sum(
            1 for (t, p) in self.historico_dosagem
            if p == parametro and time.ticks_diff(agora, t) < janela_ms
        )

    def doses_hora(self, parametro):
        return self._doses_na_janela(parametro, 3600 * 1000)

    def doses_dia(self, parametro):
        return self._doses_na_janela(parametro, 24 * 3600 * 1000)

    def iniciar_dose(self, parametro, motivo, fonte, origem="automatico", comando_id=None):
        PINOS_DOSAGEM[parametro].value(1)
        self.dose_em_andamento = parametro
        self.dose_inicio_ms    = time.ticks_ms()
        self.dose_origem       = origem
        self.dose_comando_id   = comando_id
        self.eventos_pendentes.append(("iniciada", parametro, motivo, fonte, origem, comando_id))
        print("  [DOSAGEM] {} INICIADA ({}/{})".format(parametro.upper(), fonte, origem))

    def finalizar_dose_se_necessario(self):
        if self.dose_em_andamento is None:
            return
        if time.ticks_diff(time.ticks_ms(), self.dose_inicio_ms) / 1000.0 < PULSO_DOSAGEM_SEG:
            return
        parametro  = self.dose_em_andamento
        origem     = self.dose_origem
        comando_id = self.dose_comando_id
        PINOS_DOSAGEM[parametro].value(0)
        agora = time.ticks_ms()
        self.ultima_dose_ms[parametro] = agora
        self.historico_dosagem.append((agora, parametro))
        self.dose_em_andamento = None
        self.dose_origem       = None
        self.dose_comando_id   = None
        self.eventos_pendentes.append(("concluida", parametro, "", "", origem, comando_id))
        print("  [DOSAGEM] {} FINALIZADA".format(parametro.upper()))

    def decidir_automatico(self, valor_ph, valor_cloro):
        if self.modo != "automatico":
            return None
        checks = [
            ("base",  valor_ph > 0 and valor_ph < PH_MIN,
             "pH baixo: {:.2f}".format(valor_ph)),
            ("acido", valor_ph > PH_MAX,
             "pH alto: {:.2f}".format(valor_ph)),
            ("cloro", valor_cloro >= 0 and valor_cloro < CLORO_MIN,
             "cloro baixo: {:.2f}".format(valor_cloro)),
        ]
        for (param, condicao, motivo) in checks:
            if not condicao:
                continue
            ok, razao = self.pode_dosar(param, valor_ph, valor_cloro, "automatico")
            if ok:
                return (param, motivo, "automatico", "automatico", None)
            self.eventos_pendentes.append(
                ("bloqueada", param, razao, "automatico", "automatico", None))
        return None

    def processar_comando_pendente(self, valor_ph, valor_cloro):
        if self.comando_pendente is None:
            return None
        cmd        = self.comando_pendente
        parametro  = cmd["parametro"]
        origem     = cmd.get("origem", "dashboard")
        comando_id = cmd.get("comando_id")
        self.comando_pendente = None
        if self.modo != "manual":
            self.eventos_pendentes.append(
                ("bloqueada", parametro, "modo_nao_manual", "manual", origem, comando_id))
            return None
        ok, motivo = self.pode_dosar(parametro, valor_ph, valor_cloro, "manual")
        if ok:
            return (parametro, "comando via " + origem, "manual", origem, comando_id)
        self.eventos_pendentes.append(
            ("bloqueada", parametro, motivo, "manual", origem, comando_id))
        return None

    def limpar_historico_se_necessario(self):
        agora = time.ticks_ms()
        if time.ticks_diff(agora, self.ultima_limpeza_ms) < 3600 * 1000:
            return
        retem_ms = HORAS_RETENCAO_HISTORICO * 3600 * 1000
        self.historico_dosagem = [
            (t, p) for (t, p) in self.historico_dosagem
            if time.ticks_diff(agora, t) < retem_ms
        ]
        self.ultima_limpeza_ms = agora

    def drenar_eventos(self):
        eventos = self.eventos_pendentes
        self.eventos_pendentes = []
        return eventos


falhas_mqtt = 0


def conectar_wifi():
    print("[Wi-Fi] Conectando a '{}'".format(WIFI_SSID), end="")
    sta = network.WLAN(network.STA_IF)
    sta.active(True)
    if not sta.isconnected():
        sta.connect(WIFI_SSID, WIFI_SENHA)
        while not sta.isconnected():
            print(".", end="")
            time.sleep_ms(200)
    print(" OK | IP: {}".format(sta.ifconfig()[0]))
    return sta


def conectar_mqtt(callback):
    tentativa = 0
    while True:
        try:
            print("[MQTT] Conectando a {}:{}...".format(MQTT_BROKER, MQTT_PORTA), end="")
            cliente = MQTTClient(
                MQTT_CLIENTE_ID,
                MQTT_BROKER,
                port=MQTT_PORTA,
                keepalive=MQTT_KEEPALIVE,
            )
            cliente.set_callback(callback)
            cliente.connect()
            cliente.subscribe(TOPICO_MODO_CONTROLE)
            cliente.subscribe(TOPICO_COMANDO_DOSAGEM)
            print(" OK")
            return cliente
        except Exception as e:
            tentativa += 1
            backoff = min(30, 2 ** tentativa)
            print(" FALHA ({}). Tentando em {}s...".format(e, backoff))
            time.sleep(backoff)


def publicar_seguro(cliente, topico, carga, reter=False):
    global falhas_mqtt
    try:
        cliente.publish(topico, carga, retain=reter)
        return True
    except Exception as e:
        falhas_mqtt += 1
        print("  [MQTT] Falha em '{}': {}".format(topico, e))
        return False


def construir_carga_ph(ph):
    return ujson.dumps({
        "sensor": "NTC (simula E-201-C)",
        "ph": ph,
        "faixa_ideal": "7.2 - 7.6",
        "status": obter_status(ph, PH_MIN, PH_MAX),
    })


def construir_carga_orp(orp_mv, cloro):
    return ujson.dumps({
        "sensor": "LDR (simula ORP)",
        "orp_mv": orp_mv,
        "cloro_ppm": cloro,
        "faixa_ideal": "1.0 - 3.0 ppm",
        "status": obter_status(cloro, CLORO_MIN, CLORO_MAX),
    })


def construir_carga_cond(alc):
    return ujson.dumps({
        "sensor": "MQ2 (simula condutividade)",
        "alcalinidade_ppm": alc,
        "unidade": "ppm CaCO3",
        "faixa_ideal": "80 - 120 ppm",
        "status": obter_status(alc, ALC_MIN, ALC_MAX),
    })


def construir_carga_temp_piscina(temp, umidade):
    valida = temp_valida(temp)
    return ujson.dumps({
        "sensor": "DHT22",
        "temperatura_C": temp,
        "umidade_pct": umidade,
        "faixa_ideal": "26.0 - 30.0 C",
        "status": obter_status(temp, TEMP_PISCINA_MIN, TEMP_PISCINA_MAX, valida),
    })


def construir_carga_temp_coletor(temp, delta_t):
    valida = temp_valida(temp)
    return ujson.dumps({
        "sensor": "DS18B20 (OneWire)",
        "temperatura_C": temp,
        "delta_T": round(delta_t, 1),
        "status": "OK" if valida else "ERRO",
    })


def construir_carga_bomba(ligada, delta_t, temp_piscina, temp_coletor):
    return ujson.dumps({
        "bomba": "LIGADA" if ligada else "DESLIGADA",
        "delta_T": round(delta_t, 1),
        "temp_piscina_C": temp_piscina,
        "temp_coletor_C": temp_coletor,
    })


def construir_carga_alertas(alertas):
    return ujson.dumps({
        "total": len(alertas),
        "alertas": alertas if alertas else [],
    })


def construir_carga_consolidada(ciclo, ph, orp_mv, cloro, alc,
                                 temp_piscina, temp_coletor, delta_t,
                                 umidade, bomba_ligada, alertas,
                                 modo, dose_em_andamento):
    return ujson.dumps({
        "projeto": "AquaSense IoT",
        "ciclo": ciclo,
        "ph": ph,
        "orp_mv": orp_mv,
        "cloro": cloro,
        "alcalinidade": alc,
        "temp_piscina": temp_piscina,
        "umidade": umidade,
        "temp_coletor": temp_coletor,
        "delta_t": round(delta_t, 1),
        "bomba": "LIGADA" if bomba_ligada else "DESLIGADA",
        "alertas": alertas,
        "modo": modo,
        "parada_emergencia": parada_emergencia_ativa(),
        "dose_em_andamento": dose_em_andamento,
    })


def construir_carga_evento_dosagem(parametro, evento, motivo, fonte,
                                    origem, comando_id, doses_hora, doses_dia):
    return ujson.dumps({
        "parametro": parametro,
        "evento": evento,
        "motivo": motivo,
        "fonte": fonte,
        "origem": origem,
        "comando_id": comando_id,
        "doses_hora": doses_hora,
        "doses_dia": doses_dia,
    })


def construir_carga_estado_controle(modo, dose_em_andamento):
    return ujson.dumps({
        "modo": modo,
        "parada_emergencia": parada_emergencia_ativa(),
        "dose_em_andamento": dose_em_andamento,
    })


def construir_carga_saude(sta_if, dosador):
    try:
        rssi = sta_if.status('rssi') or 0
    except Exception:
        rssi = 0
    return ujson.dumps({
        "tempo_ativo_s": time.ticks_diff(time.ticks_ms(), boot_ms) // 1000,
        "heap_livre_kb": gc.mem_free() // 1024,
        "rssi_wifi_dbm": rssi,
        "erros_dht": erros_dht,
        "erros_ds": erros_ds,
        "falhas_mqtt": falhas_mqtt,
        "doses_hoje": {
            "cloro": dosador.doses_dia("cloro"),
            "acido": dosador.doses_dia("acido"),
            "base":  dosador.doses_dia("base"),
        },
    })


def construir_carga_alexa_snapshot(ph, cloro, alc, temp_piscina, temp_coletor,
                                    bomba_ligada, modo, alertas, dose_em_andamento):
    return ujson.dumps({
        "ph": ph,
        "cloro_ppm": cloro,
        "alcalinidade_ppm": alc,
        "temp_piscina_c": temp_piscina if temp_valida(temp_piscina) else None,
        "temp_coletor_c": temp_coletor if temp_valida(temp_coletor) else None,
        "bomba_circulacao": "ligada" if bomba_ligada else "desligada",
        "modo": modo,
        "alertas_count": len(alertas),
        "alertas_resumo": alertas[:3] if alertas else [],
        "dose_em_andamento": dose_em_andamento,
        "parada_emergencia": parada_emergencia_ativa(),
        "timestamp_ms": time.ticks_ms(),
    })


def construir_carga_alexa_resposta(comando_id, resultado, parametro, motivo=""):
    return ujson.dumps({
        "comando_id": comando_id,
        "resultado": resultado,
        "parametro": parametro,
        "motivo": motivo,
        "timestamp_ms": time.ticks_ms(),
    })


def imprimir_debug(ciclo, ph, orp_mv, cloro, alc,
                   temp_piscina, umidade, temp_coletor, delta_t,
                   bomba_ligada, alertas, modo, dose_em_andamento):
    def ok(v, lo, hi):
        return "ok" if lo <= v <= hi else "!"
    print("--- Ciclo #{} | modo={} | parada={} ---".format(
        ciclo, modo, "ATIVO" if parada_emergencia_ativa() else "ok"))
    print("  pH:{:.2f} {}  Cl:{:.2f} {}  Alc:{:.0f} {}".format(
        ph, ok(ph, PH_MIN, PH_MAX),
        cloro, ok(cloro, CLORO_MIN, CLORO_MAX),
        alc, ok(alc, ALC_MIN, ALC_MAX)))
    print("  T.Pisc:{:.1f}C  T.Col:{:.1f}C  dT:{:.1f}C  Bomba:{}".format(
        temp_piscina, temp_coletor, delta_t, "ON" if bomba_ligada else "off"))
    if dose_em_andamento:
        print("  >>> DOSANDO: {}".format(dose_em_andamento.upper()))
    if alertas:
        print("  ALERTAS: {}".format(", ".join(alertas)))


_referencia_dosador = [None]


def callback_mqtt(topico, msg):
    dosador = _referencia_dosador[0]
    if dosador is None:
        return
    try:
        topico_str = topico.decode() if isinstance(topico, bytes) else topico
        dados = ujson.loads(msg.decode() if isinstance(msg, bytes) else msg)
        if topico_str == TOPICO_MODO_CONTROLE:
            novo_modo = dados.get("modo")
            if novo_modo in ("automatico", "manual", "parada"):
                if novo_modo != dosador.modo:
                    print("  [CONTROLE] modo: {} → {}".format(dosador.modo, novo_modo))
                    dosador.modo = novo_modo
        elif topico_str == TOPICO_COMANDO_DOSAGEM:
            parametro = dados.get("parametro")
            if parametro in ("cloro", "acido", "base"):
                origem = dados.get("origem", "dashboard")
                if origem not in ("dashboard", "alexa"):
                    origem = "dashboard"
                dosador.comando_pendente = {
                    "parametro":  parametro,
                    "origem":     origem,
                    "comando_id": dados.get("comando_id"),
                }
                print("  [CONTROLE] comando: {} origem:{}".format(parametro, origem))
    except Exception as e:
        print("  [MQTT] erro callback: {}".format(e))


print("=" * 50)
print("  AquaSense IoT v{}".format(VERSAO_FIRMWARE))
print("  Broker: {}:{}  (publico, sem TLS)".format(MQTT_BROKER, MQTT_PORTA))
print("  Namespace: {}".format(MQTT_NAMESPACE))
print("=" * 50)

boot_ms = time.ticks_ms()
sta_if  = conectar_wifi()
cliente = conectar_mqtt(callback_mqtt)

print("[DS18B20] Escaneando...", end="")
try:
    ds_roms = sensor_ds.scan()
    print(" OK | ROM: {}".format(ds_roms[0]) if ds_roms else " nenhum encontrado")
except Exception as e:
    print(" Erro: {}".format(e))
    ds_roms = []

for _ in range(3):
    led_status.on(); time.sleep_ms(150)
    led_status.off(); time.sleep_ms(150)

bomba   = ControladorBomba(DELTA_T_LIGAR, DELTA_T_DESLIGAR, ANTI_CICLO_SEG)
dosador = ControladorDosagem()
_referencia_dosador[0] = dosador

publicar_seguro(cliente, TOPICO_STATUS, ujson.dumps({
    "status": "online",
    "ip": sta_if.ifconfig()[0],
    "firmware": VERSAO_FIRMWARE,
    "broker": "{}:{}".format(MQTT_BROKER, MQTT_PORTA),
    "namespace": MQTT_NAMESPACE,
    "modo_inicial": dosador.modo,
    "alexa_integrado": True,
}), reter=True)

publicar_seguro(cliente, TOPICO_ESTADO_CONTROLE,
                construir_carga_estado_controle(dosador.modo, dosador.dose_em_andamento),
                reter=True)

print("\n[OK] Pronto. Loop de {}s iniciado.\n".format(INTERVALO_CICLO))
time.sleep(1)

ciclo = 0
ultimo_publish_saude_ms = 0
ultimo_modo = dosador.modo

while True:
    ciclo += 1

    try:
        cliente.check_msg()
    except Exception as e:
        falhas_mqtt += 1
        print("  [MQTT] check_msg: {}".format(e))

    bruto_ph   = ler_adc_media(adc_ph)
    bruto_orp  = ler_adc_media(adc_orp)
    bruto_cond = ler_adc_media(adc_cond)

    valor_ph              = adc_para_ph(bruto_ph)
    orp_mv, cloro_ppm     = adc_para_orp(bruto_orp)
    alcalinidade          = adc_para_alcalinidade(bruto_cond)
    temp_piscina, umidade = ler_dht22()
    temp_coletor          = ler_ds18b20()

    bomba_ligada, delta_t = bomba.atualizar(temp_piscina, temp_coletor)
    led_bomba.value(1 if bomba_ligada else 0)

    alertas = verificar_alertas(valor_ph, cloro_ppm, alcalinidade, temp_piscina)
    led_status.value(0 if alertas else 1)

    dosador.finalizar_dose_se_necessario()

    decisao = None
    if dosador.modo == "automatico":
        decisao = dosador.decidir_automatico(valor_ph, cloro_ppm)
    elif dosador.modo == "manual":
        decisao = dosador.processar_comando_pendente(valor_ph, cloro_ppm)

    if decisao is not None:
        parametro, motivo, fonte, origem, comando_id = decisao
        dosador.iniciar_dose(parametro, motivo, fonte, origem, comando_id)

    dosador.limpar_historico_se_necessario()

    imprimir_debug(ciclo, valor_ph, orp_mv, cloro_ppm, alcalinidade,
                   temp_piscina, umidade, temp_coletor, delta_t,
                   bomba_ligada, alertas, dosador.modo, dosador.dose_em_andamento)

    publicacoes = [
        (TOPICO_PH,           construir_carga_ph(valor_ph)),
        (TOPICO_ORP,          construir_carga_orp(orp_mv, cloro_ppm)),
        (TOPICO_COND,         construir_carga_cond(alcalinidade)),
        (TOPICO_TEMP_PISCINA, construir_carga_temp_piscina(temp_piscina, umidade)),
        (TOPICO_TEMP_COLETOR, construir_carga_temp_coletor(temp_coletor, delta_t)),
        (TOPICO_BOMBA,        construir_carga_bomba(bomba_ligada, delta_t,
                                                    temp_piscina, temp_coletor)),
        (TOPICO_ALERTAS,      construir_carga_alertas(alertas)),
        (TOPICO_DADOS,        construir_carga_consolidada(
                                  ciclo, valor_ph, orp_mv, cloro_ppm, alcalinidade,
                                  temp_piscina, temp_coletor, delta_t, umidade,
                                  bomba_ligada, alertas, dosador.modo,
                                  dosador.dose_em_andamento)),
    ]

    sucesso = sum(1 for t, c in publicacoes if publicar_seguro(cliente, t, c))

    publicar_seguro(cliente, TOPICO_ALEXA_SNAPSHOT,
                    construir_carga_alexa_snapshot(
                        valor_ph, cloro_ppm, alcalinidade,
                        temp_piscina, temp_coletor,
                        bomba_ligada, dosador.modo, alertas,
                        dosador.dose_em_andamento),
                    reter=True)

    for (tipo_evento, parametro, motivo, fonte, origem, comando_id) in dosador.drenar_eventos():
        publicar_seguro(cliente, TOPICO_EVENTO_DOSAGEM,
                        construir_carga_evento_dosagem(
                            parametro, tipo_evento, motivo, fonte, origem, comando_id,
                            dosador.doses_hora(parametro), dosador.doses_dia(parametro)))
        if origem == "alexa" and comando_id is not None:
            publicar_seguro(cliente, TOPICO_ALEXA_RESPOSTA,
                            construir_carga_alexa_resposta(
                                comando_id, tipo_evento, parametro, motivo))
            print("  [ALEXA] resposta: {} → {} id={}".format(parametro, tipo_evento, comando_id))

    parada_mudou = parada_emergencia_mudou()
    if dosador.modo != ultimo_modo or dosador.dose_em_andamento or parada_mudou:
        publicar_seguro(cliente, TOPICO_ESTADO_CONTROLE,
                        construir_carga_estado_controle(dosador.modo,
                                                        dosador.dose_em_andamento),
                        reter=True)
        ultimo_modo = dosador.modo

    if time.ticks_diff(time.ticks_ms(), ultimo_publish_saude_ms) >= PERIODO_SAUDE_SEG * 1000:
        publicar_seguro(cliente, TOPICO_SAUDE, construir_carga_saude(sta_if, dosador))
        ultimo_publish_saude_ms = time.ticks_ms()

    if sucesso < len(publicacoes) // 2:
        print("  [MQTT] Muitas falhas. Reconectando...")
        try:
            cliente.disconnect()
        except:
            pass
        cliente = conectar_mqtt(callback_mqtt)
    else:
        print("  [MQTT] {}/{} publicados\n".format(sucesso, len(publicacoes)))

    time.sleep(INTERVALO_CICLO)
