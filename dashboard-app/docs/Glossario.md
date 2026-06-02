# Glossário de tradução — AquaSense Fork PT

> Este documento define a tradução EN→PT para todo termo que aparece em mais de um lugar do sistema. Firmware (`main.py`) e dashboard (TypeScript) seguem este glossário para garantir consistência. Sem isso, firmware diz `cloro` e dashboard espera `chlorine` — quebra.

## Princípios

1. **Termos do domínio (química, hardware) traduz** — operador brasileiro vai ler estes
2. **APIs de bibliotecas mantém** — `useState`, `time.ticks_ms()`, `mqtt.connect()` são interface externa
3. **pH não traduz** — é nome universal
4. **Siglas técnicas (ESP32, MQTT, ORP, NTC, LDR) mantém** — são nomes próprios

## Tabela mestre — payload MQTT (decisão crítica)

Esta é a parte mais importante. Cada campo aqui aparece em firmware E dashboard. Tem que ser idêntico.

### Payload `dados` (consolidado, antigo `data`)

| EN (atual) | PT (fork) | Notas |
|---|---|---|
| `project` | `projeto` | string fixa "AquaSense IoT" |
| `cycle` | `ciclo` | contador incremental |
| `ph` | `ph` | universal, não traduz |
| `orp_mv` | `orp_mv` | sigla ORP universal |
| `chlorine` | `cloro` | |
| `alkalinity` | `alcalinidade` | |
| `temp_pool` | `temp_piscina` | |
| `humidity` | `umidade` | |
| `temp_solar` | `temp_coletor` | "solar" → "coletor" é mais claro em PT |
| `delta_t` | `delta_t` | universal técnico |
| `pump` | `bomba` | |
| `alerts` | `alertas` | |
| `mode` | `modo` | |
| `estop` | `parada_emergencia` | E-Stop é estrangeirismo, melhor expandir |
| `dose_in_progress` | `dose_em_andamento` | |

### Payload `saude` (antigo `health`)

| EN | PT | Notas |
|---|---|---|
| `uptime_s` | `tempo_ativo_s` | |
| `free_heap_kb` | `heap_livre_kb` | "heap" é técnico mas universal em embedded |
| `wifi_rssi_dbm` | `rssi_wifi_dbm` | RSSI é sigla universal |
| `dht_errors` | `erros_dht` | DHT é nome do sensor |
| `ds_errors` | `erros_ds` | DS é nome do sensor |
| `mqtt_failures` | `falhas_mqtt` | |
| `doses_today` | `doses_hoje` | |

### Payload `estado_controle` (antigo `control/state`)

| EN | PT |
|---|---|
| `mode` | `modo` |
| `estop` | `parada_emergencia` |
| `dose_in_progress` | `dose_em_andamento` |

### Payload `evento_dosagem` (antigo `dosing/event`)

| EN | PT | Notas |
|---|---|---|
| `parameter` | `parametro` | |
| `event` | `evento` | |
| `reason` | `motivo` | |
| `doses_hour` | `doses_hora` | |
| `doses_day` | `doses_dia` | |

### Valores enum

**Modos de operação** (já estavam em EN, viram PT):
- `auto` → `automatico`
- `manual` → `manual` (igual em PT)
- `estop` → `parada` (firmware ainda aceita, dashboard ignora — Decisão 5)

**Tipos de evento de dosagem:**
- `started` → `iniciada`
- `completed` → `concluida`
- `blocked` → `bloqueada`

**Razões de bloqueio** (já estavam em snake_case EN, viram PT):
- `estop_active` → `parada_emergencia_ativa`
- `mode_estop` → `modo_parada`
- `sensor_error_chlorine` → `erro_sensor_cloro`
- `sensor_error_ph` → `erro_sensor_ph`
- `dose_in_progress` → `dose_em_andamento`
- `dead_time` → `tempo_morto`
- `interlock_ph_chlorine` → `intertravamento_ph_cloro`
- `hourly_limit` → `limite_horario`
- `daily_limit` → `limite_diario`

**Estado da bomba:**
- `ON` → `LIGADA`
- `OFF` → `DESLIGADA`

**Status de leitura:**
- `OK` → `OK` (mantém, é universal)
- `BAIXO` → `BAIXO` (já está em PT)
- `ALTO` → `ALTO` (já está em PT)
- `ERRO` → `ERRO` (já está em PT)

**Produtos químicos** (já estavam em PT):
- `cloro`, `acido`, `base` — não muda

## Tópicos MQTT

Namespace muda para diferenciar do firmware oficial. Subtópicos traduzidos:

```
aquasense-ibmec-pt/
├── piscina/
│   ├── ph
│   ├── orp
│   ├── condutividade
│   └── temperatura
├── coletor/
│   ├── temperatura
│   └── bomba
├── sistema/
│   ├── alertas
│   ├── status
│   └── saude
├── dosagem/
│   ├── evento
│   └── comando
├── controle/
│   ├── modo
│   └── estado
└── dados                    # consolidado (payload primário)
```

Mapeamento de antes para depois:

| Antes | Depois |
|---|---|
| `aquasense-ibmec/data` | `aquasense-ibmec-pt/dados` |
| `aquasense-ibmec/pool/ph` | `aquasense-ibmec-pt/piscina/ph` |
| `aquasense-ibmec/pool/orp` | `aquasense-ibmec-pt/piscina/orp` |
| `aquasense-ibmec/pool/conductivity` | `aquasense-ibmec-pt/piscina/condutividade` |
| `aquasense-ibmec/pool/temperature` | `aquasense-ibmec-pt/piscina/temperatura` |
| `aquasense-ibmec/solar/temperature` | `aquasense-ibmec-pt/coletor/temperatura` |
| `aquasense-ibmec/solar/pump` | `aquasense-ibmec-pt/coletor/bomba` |
| `aquasense-ibmec/system/alerts` | `aquasense-ibmec-pt/sistema/alertas` |
| `aquasense-ibmec/system/status` | `aquasense-ibmec-pt/sistema/status` |
| `aquasense-ibmec/system/health` | `aquasense-ibmec-pt/sistema/saude` |
| `aquasense-ibmec/dosing/event` | `aquasense-ibmec-pt/dosagem/evento` |
| `aquasense-ibmec/dosing/command` | `aquasense-ibmec-pt/dosagem/comando` |
| `aquasense-ibmec/control/state` | `aquasense-ibmec-pt/controle/estado` |
| `aquasense-ibmec/control/mode` | `aquasense-ibmec-pt/controle/modo` |

## Firmware Python — variáveis e funções

### Constantes globais

| EN | PT |
|---|---|
| `WIFI_SSID`, `WIFI_PASS` | mantém (são keys de Wi-Fi) |
| `MQTT_BROKER`, `MQTT_PORT` | mantém (MQTT é sigla) |
| `MQTT_NAMESPACE` | mantém |
| `PIN_NTC_PH`, `PIN_LDR_ORP`, etc | mantém (siglas de sensores) |
| `PH_MIN`, `PH_MAX` | mantém (pH universal) |
| `CL_MIN`, `CL_MAX` | `CLORO_MIN`, `CLORO_MAX` |
| `ALK_MIN`, `ALK_MAX` | `ALC_MIN`, `ALC_MAX` |
| `TEMP_POOL_MIN`, `TEMP_POOL_MAX` | `TEMP_PISCINA_MIN`, `TEMP_PISCINA_MAX` |
| `DELTA_T_ON`, `DELTA_T_OFF` | mantém (técnico universal) |
| `ANTI_CYCLE_SEC` | `ANTI_CICLO_SEG` |
| `CYCLE_INTERVAL` | `INTERVALO_CICLO` |
| `ADC_SAMPLES` | `AMOSTRAS_ADC` |
| `SENSOR_ERROR` | `ERRO_SENSOR` |
| `DOSING_PULSE_SEC` | `PULSO_DOSAGEM_SEG` |
| `HEALTH_PERIOD_SEC` | `PERIODO_SAUDE_SEG` |
| `DOSING_HISTORY_RETAIN_HOURS` | `HORAS_RETENCAO_HISTORICO` |
| `DEAD_TIME_*_SEC` | `TEMPO_MORTO_*_SEG` |
| `INTERLOCK_SEC` | `INTERTRAVAMENTO_SEG` |
| `MAX_DOSES_HOUR_*` | `MAX_DOSES_HORA_*` |
| `MAX_DOSES_DAY_*` | `MAX_DOSES_DIA_*` |
| `FIRMWARE_VERSION` | `VERSAO_FIRMWARE` |

### Tópicos como variáveis

| EN | PT |
|---|---|
| `TOPIC_PH` | `TOPICO_PH` |
| `TOPIC_ORP` | `TOPICO_ORP` |
| `TOPIC_COND` | `TOPICO_COND` |
| `TOPIC_TEMP_POOL` | `TOPICO_TEMP_PISCINA` |
| `TOPIC_TEMP_SOLAR` | `TOPICO_TEMP_COLETOR` |
| `TOPIC_PUMP` | `TOPICO_BOMBA` |
| `TOPIC_ALERTS` | `TOPICO_ALERTAS` |
| `TOPIC_STATUS` | `TOPICO_STATUS` |
| `TOPIC_ALL` | `TOPICO_DADOS` |
| `TOPIC_HEALTH` | `TOPICO_SAUDE` |
| `TOPIC_DOSING_EVENT` | `TOPICO_EVENTO_DOSAGEM` |
| `TOPIC_CONTROL_STATE` | `TOPICO_ESTADO_CONTROLE` |
| `TOPIC_CONTROL_MODE` | `TOPICO_MODO_CONTROLE` |
| `TOPIC_DOSING_COMMAND` | `TOPICO_COMANDO_DOSAGEM` |

### Classes

| EN | PT |
|---|---|
| `PumpController` | `ControladorBomba` |
| `DosingController` | `ControladorDosagem` |

### Funções

| EN | PT |
|---|---|
| `init_adc(pin_num)` | `iniciar_adc(num_pino)` |
| `read_adc_avg(adc, n)` | `ler_adc_media(adc, n)` |
| `adc_to_ph(raw)` | `adc_para_ph(bruto)` |
| `adc_to_orp(raw)` | `adc_para_orp(bruto)` |
| `adc_to_alkalinity(raw)` | `adc_para_alcalinidade(bruto)` |
| `read_ds18b20()` | `ler_ds18b20()` |
| `read_dht22()` | `ler_dht22()` |
| `is_valid_temp(t)` | `temp_valida(t)` |
| `get_status(value, min_v, max_v, valid)` | `obter_status(valor, min_v, max_v, valido)` |
| `check_alerts(ph, chlorine, alk, temp_pool)` | `verificar_alertas(ph, cloro, alc, temp_piscina)` |
| `estop_active()` | `parada_emergencia_ativa()` |
| `estop_changed()` | `parada_emergencia_mudou()` |
| `connect_wifi()` | `conectar_wifi()` |
| `connect_mqtt(callback)` | `conectar_mqtt(callback)` |
| `safe_publish(client, topic, payload, retain)` | `publicar_seguro(cliente, topico, carga, reter)` |
| `build_*_payload(...)` | `construir_carga_*(...)` |
| `print_cycle_debug(...)` | `imprimir_debug_ciclo(...)` |
| `mqtt_callback(topic, msg)` | `callback_mqtt(topico, msg)` |

### Métodos da classe `ControladorDosagem`

| EN | PT |
|---|---|
| `can_dose(parametro, ph, chlorine)` | `pode_dosar(parametro, ph, cloro)` |
| `_doses_in_window(parametro, window_ms)` | `_doses_na_janela(parametro, janela_ms)` |
| `doses_hour(parametro)` | `doses_hora(parametro)` |
| `doses_day(parametro)` | `doses_dia(parametro)` |
| `start_dose(parametro, motivo)` | `iniciar_dose(parametro, motivo)` |
| `finalize_dose_if_needed()` | `finalizar_dose_se_necessario()` |
| `decide_auto(ph, chlorine)` | `decidir_automatico(ph, cloro)` |
| `handle_pending_command(ph, chlorine)` | `processar_comando_pendente(ph, cloro)` |
| `cleanup_history_if_needed()` | `limpar_historico_se_necessario()` |
| `drain_events()` | `drenar_eventos()` |

### Atributos da classe

| EN | PT |
|---|---|
| `self.mode` | `self.modo` |
| `self.dose_in_progress` | `self.dose_em_andamento` |
| `self.dose_start_ms` | `self.dose_inicio_ms` |
| `self.last_dose_ms` | `self.ultima_dose_ms` |
| `self.dosing_history` | `self.historico_dosagem` |
| `self.last_cleanup_ms` | `self.ultima_limpeza_ms` |
| `self.pending_command` | `self.comando_pendente` |
| `self.pending_events` | `self.eventos_pendentes` |
| `self.on_threshold`, `self.off_threshold` | `self.limiar_ligar`, `self.limiar_desligar` |
| `self.anti_cycle_ms` | `self.anti_ciclo_ms` |
| `self.state` | `self.estado` |
| `self.last_change` | `self.ultima_mudanca` |

## Dashboard TypeScript — variáveis e funções

### Stores e providers

| EN | PT |
|---|---|
| `MqttProvider` | `ProvedorMqtt` |
| `poolStore` | `estadoPiscina` |
| `useMqtt()` | `useMqtt()` (hook React, mantém prefixo `use`) |
| `useControlState()` | `useEstadoControle()` |
| `useDosingEvents()` | `useEventosDosagem()` |
| `useSystemHealth()` | `useSaudeSistema()` |
| `useMqttCommands()` | `useComandosMqtt()` |

### Hooks customizados

| EN | PT |
|---|---|
| `useAquaSense` | `useAquaSense` (nome do projeto, mantém) |
| `useCalibration` | `useCalibracao` |
| `useHoldToConfirm` | `useSeguraConfirmar` |
| `useCommandHistory` | `useHistoricoComandos` |
| `usePersistentState` | `useEstadoPersistente` |
| `useNow` | `useAgora` |
| `useTheme` | `useTema` |

### Componentes

| EN | PT |
|---|---|
| `AppShell` | `EstruturaApp` |
| `HeroPanel` | `PainelDestaque` |
| `ParameterCard` | `CartaoParametro` |
| `CalibrationField` | `CampoCalibracao` |
| `HoldButton` | `BotaoSegurar` |
| `AdvancedControlPanel` | `PainelControleAvancado` |
| `DiagnosticPanel` | `PainelDiagnostico` |
| `AlertsPanel` | `PainelAlertas` |
| `HistoryCharts` | `GraficosHistorico` (mas vai virar `MiniDashboards` no fork) |
| `HeatingControl` | `ControleAquecimento` |
| `SettingsPanel` | `PainelConfiguracoes` |
| `MqttLog` | `LogMqtt` |
| `ConnectionPill` | `PilulaConexao` |
| `StatusPill` | `PilulaStatus` |
| `IncidentBanner` | `BannerIncidente` |
| `LastUpdate` | `UltimaAtualizacao` |

### Funções e variáveis comuns

| EN | PT |
|---|---|
| `loading` | `carregando` |
| `error` | `erro` |
| `data` | `dados` |
| `value` | `valor` |
| `connected` | `conectado` |
| `status` | `status` (universal) |
| `source` | `fonte` |
| `topic` | `topico` |
| `payload` | `carga` |
| `handleClick` | `aoClicar` |
| `handleChange` | `aoMudar` |
| `handleSubmit` | `aoEnviar` |
| `formatDate` | `formatarData` |
| `parseValue` | `analisarValor` |
| `validateInput` | `validarEntrada` |
| `describeMqttStatus` | `descreverStatusMqtt` |
| `hasLiveFirmware` | `temFirmwareAoVivo` |
| `lastMessageAt` | `ultimaMensagemEm` |
| `optimisticMode` | `modoOtimista` |
| `pendingMode` | `modoPendente` |

### Schemas Zod

| EN | PT |
|---|---|
| `ConsolidatedDataSchema` | `EsquemaDadosConsolidados` |
| `SystemHealthSchema` | `EsquemaSaudeSistema` |
| `ControlStateSchema` | `EsquemaEstadoControle` |
| `DosingEventSchema` | `EsquemaEventoDosagem` |
| `SystemStatusSchema` | `EsquemaStatusSistema` |

### Constantes de domínio

| EN | PT |
|---|---|
| `RANGES` | `FAIXAS` |
| `PUMP_HYSTERESIS` | `HISTERESE_BOMBA` |
| `SENSOR_ERROR_VALUE` | `VALOR_ERRO_SENSOR` |
| `STALE_THRESHOLD_MS` | `LIMIAR_OBSOLETO_MS` |
| `COMMAND_HISTORY_MAX` | `MAX_HISTORICO_COMANDOS` |

## NÃO traduz

Lista explícita do que **fica em inglês**:

**Bibliotecas e APIs:**
- React: `useState`, `useEffect`, `useMemo`, `useRef`, `useCallback`
- React Router (TanStack): `Route`, `useNavigate`, `Outlet`
- Zustand: `create`, `set`, `get`
- Zod: `z.object`, `z.string`, `z.number`, `parse`, `safeParse`
- mqtt.js: `mqtt.connect`, `client.subscribe`, `client.publish`, `client.on`
- Recharts: `LineChart`, `XAxis`, `YAxis`, `Tooltip`, `Legend`
- Framer Motion: `motion`, `AnimatePresence`, `whileHover`
- MicroPython: `time.ticks_ms`, `network.WLAN`, `Pin`, `ADC`, `MQTTClient`

**Tags HTML, atributos, eventos:**
- `<div>`, `<button>`, `<input>`, `className`, `onClick`, `onChange`

**Tailwind classes:**
- `flex`, `bg-cyan-500`, `hover:`, `md:hidden`

**Siglas técnicas:**
- ESP32, MQTT, WSS, TCP, ORP, NTC, LDR, DHT, ADC, GPIO, RSSI, JSON, CSV, HTTP

**Nomes próprios:**
- AquaSense, IBMEC, Invivio, HiveMQ, Wokwi, Lovable

**Termos universais sem boa tradução:**
- pH, delta_t, heap, debug, log, push, pull, callback

## Mensagens de UI (microcopy)

Estas precisam estar em PT impecável:

| Contexto | EN antigo | PT (fork) |
|---|---|---|
| Boot | "Waiting for first cycle..." | "Aguardando primeiro ciclo do ESP32..." |
| Conexão OK | "ESP32 live" | "ESP32 ao vivo" |
| Conexão aguardando | "Waiting for ESP32" | "Aguardando ESP32" |
| Conexão offline | "MQTT offline" | "MQTT desconectado" |
| Sem telemetria recente | "Sem telemetria real do ESP32 — comandos bloqueados" | mantém |
| Banner E-Stop | "E-STOP ATIVO" | "PARADA DE EMERGÊNCIA ATIVA" |
| Banner cloro=0 | "Sensor de cloro pode estar quebrado" | mantém |
| Hold button progress | "Segure por 1.5s" | mantém |
| Dose bloqueada | "Dose bloqueada: dead_time" | "Dose bloqueada: tempo morto" |
| Status operacional | "OPERATIONAL" | "OPERACIONAL" |
| Atualização há | "atualizado há 3s · ciclo #142" | mantém |

## Notas finais

**Verificação cruzada:** depois de aplicar este glossário, faz uma busca por termos em inglês que sobraram. Comandos úteis:

```bash
# No firmware
grep -E "(chlorine|alkalinity|cycle|mode|estop|dose_in_progress)" main.py

# No dashboard
grep -rE "(loading|error|chlorine|alkalinity)" src/
```

Se encontrar, ou ficou de propósito (lista de "não traduz") ou é tradução faltando.

**Schemas Zod precisam casar com payload PT:** se o schema espera `chlorine` mas firmware publica `cloro`, todos os dados serão descartados pela validação. Coordenação cuidadosa.

**Bom senso linguístico:**
- Português técnico aceita anglicismos quando soa melhor: "callback", "buffer", "thread", "log", "debug" são universais
- Mas evita anglicismos quando há palavra brasileira clara: "loading" → "carregando" (não "loading"), "error" → "erro" (não "error")
