// AquaSense IoT — Tipos exatos dos payloads publicados pelo ESP32 (main.py).
// Fonte: tópico aquasense-ibmec/data (consolidado) e tópicos individuais aquasense-ibmec/*.
// NÃO renomear campos — eles batem 1:1 com o JSON do firmware.

export type WaterStatus = "OK" | "BAIXO" | "ALTO";
export type PumpStatus = "LIGADA" | "DESLIGADA";
export type LedStatus = "ACESO" | "APAGADO";

export interface WaterQuality {
  ph: number;
  ph_status: WaterStatus;
  cloro_ppm: number;
  cloro_status: WaterStatus;
  orp_mv: number;
  alcalinidade_ppm: number;
  alcalinidade_status: WaterStatus;
}

export interface Temperatures {
  piscina_C: number;
  coletor_solar_C: number;
  delta_T: number;
  umidade_pct: number;
}

export interface PumpState {
  bomba: PumpStatus;
  led_status: LedStatus;
}

export interface AquaSenseData {
  projeto: string;
  ciclo: number;
  qualidade_agua: WaterQuality;
  temperaturas: Temperatures;
  controle: PumpState;
  alertas: string[];
  // v4.0 — controle autônomo. Opcionais para backward-compat com firmware v3.0
  // que ainda não publica esses campos. Ver MqttProvider e ControlStateMessage.
  mode?: ControlMode;
  estop?: boolean;
  dose_in_progress?: DoseChemical | null;
}

// v4.0 — modos do firmware.
// "auto"   = sistema decide dosagem; só dosa nesse modo.
// "manual" = aguarda comando humano; boot conservador inicia aqui.
// "estop"  = E-Stop ativo; nada dosa, sem exceção.
export type ControlMode = "auto" | "manual" | "estop";

// v4.0 — produtos químicos das 3 dosadoras peristálticas.
export type DoseChemical = "cloro" | "acido" | "base";

// v4.0 — eventos publicados em aquasense-ibmec/dosing/event.
// "started"   = bomba ligou.
// "completed" = bomba terminou tempo programado.
// "blocked"   = uma das 8 camadas de segurança vetou — `motivo` explica qual.
export type DoseEventKind = "started" | "completed" | "blocked";

export interface DoseEvent {
  t: number; // timestamp local (Date.now()) da chegada
  parameter: DoseChemical; // qual dosadora
  event: DoseEventKind;
  reason?: string; // motivo (start: gatilho; blocked: camada que vetou)
  doses_hour?: number; // doses do mesmo produto na última hora
  doses_day?: number; // doses do mesmo produto nas últimas 24h
  // FORK PT (Melhoria 1) — origem do comando que disparou o evento.
  // "automatico" = veio de decidir_automatico() do firmware.
  // "manual"     = veio de processar_comando_pendente() (operador).
  // undefined    = evento `concluida` (continuação de uma `iniciada` já registrada).
  // Aparece no log de eventos como ícone 🤖 / 👤 para auditoria pós-incidente.
  fonte?: "automatico" | "manual";
}

// v4.0 — payload retain de aquasense-ibmec/control/state.
// Espelha os 3 campos do `data` mas chega imediatamente após subscribe
// (broker entrega o último valor retido), sem esperar 5s do próximo ciclo.
export interface ControlStateMessage {
  mode: ControlMode;
  estop: boolean;
  dose_in_progress: DoseChemical | null;
  t: number; // timestamp local da última atualização
}

// v4.0 — payload de aquasense-ibmec/system/health (60s).
// Todos campos opcionais porque o firmware pode publicar parcialmente
// (ex.: rssi indisponível em modo offline). Nunca inventar valor — UI
// mostra "—" ou "aguardando" quando ausente.
export interface SystemHealthMessage {
  t: number; // timestamp local da chegada
  uptime_s?: number;
  free_heap_kb?: number;
  wifi_rssi_dbm?: number;
  dht_errors?: number;
  ds_errors?: number;
  mqtt_failures?: number;
  // v4.0 — contagem diária por produto. Fonte autoritativa do firmware
  // (mantém histórico além do buffer local de 50 eventos do dashboard).
  doses_today?: {
    cloro: number;
    acido: number;
    base: number;
  };
}

// Valor sentinela publicado pelo firmware quando um sensor falha
export const SENSOR_ERROR_VALUE = -99.0;

export function isSensorError(v: number | undefined | null): boolean {
  return v === undefined || v === null || v <= -50;
}

// Tipos auxiliares para o provider
export type MqttConnectionStatus = "connecting" | "connected" | "disconnected" | "error";
export type DataSource = "mqtt" | "fallback" | "none";

export interface MqttLogEntry {
  t: number;
  topic: string;
  payload: string;
}

export interface MqttContextValue {
  status: MqttConnectionStatus;
  source: DataSource;
  lastMessageAt: number | null;
  cycle: number | null;
  log: MqttLogEntry[];
  // Última mensagem consolidada já parseada
  data: AquaSenseData | null;
  // Detecção de buracos na sequência de ciclos (ver src/lib/cycleGaps.ts).
  // gaps: histórico FIFO (até 50). totalGaps: contagem desde o mount.
  gaps: import("@/lib/cycleGaps").GapEvent[];
  totalGaps: number;
  // Quantas mensagens VÁLIDAS no tópico `data` foram processadas desde
  // o mount do provider. Usado pela aba Diagnóstico. Conta só `data` —
  // tópicos granulares são informativos e não disparam UI.
  messagesReceivedCount: number;
  // Timestamp do mount do provider (Date.now()). Base para calcular
  // "Dashboard ativo há X" e taxa média de ciclos.
  providerMountedAt: number;
  // v4.0 — Estado de controle e telemetria técnica do firmware.
  // dosingEvents: FIFO de até 50 eventos das dosadoras (mais recente primeiro).
  // controlState: último estado retido (chega imediato após subscribe).
  // systemHealth: última leitura de health (a cada 60s do firmware).
  dosingEvents: DoseEvent[];
  controlState: ControlStateMessage | null;
  systemHealth: SystemHealthMessage | null;
  // v4.0 — comandos ativos. Publicam em control/mode e dosing/command.
  // Throttle de 1s; rejeitam silenciosamente clique repetido do mesmo
  // comando. Lançam Error com mensagem amigável quando MQTT desconectado.
  // Note: publishMode aceita apenas "auto" | "manual" no dashboard —
  // "estop" é hardware-exclusivo (GPIO 13). Tipo amplo aqui pra não
  // forçar dois enums; UI restringe via toggle.
  publishMode: (mode: ControlMode) => Promise<void>;
  publishDosingCommand: (parameter: DoseChemical) => Promise<void>;
}
