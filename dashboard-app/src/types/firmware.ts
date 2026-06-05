// AquaSense IoT — Tipos exatos dos payloads publicados pelo ESP32 (firmware v2.3).
// Namespace: aquasense-ibmec. O firmware publica leituras individuais, um
// snapshot consolidado para a Alexa (retain) e responde comandos de dosagem
// em alexa/resposta. NÃO renomear campos do snapshot — batem 1:1 com o JSON.

export type WaterStatus = "OK" | "BAIXO" | "ALTO";
export type PumpStatus = "LIGADA" | "DESLIGADA";
export type LedStatus = "ACESO" | "APAGADO";

export interface WaterQuality {
  ph: number;
  ph_status: WaterStatus;
  cloro: number;
  cloro_status: WaterStatus;
  alcalinidade: number;
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
}

// Produtos químicos das 3 dosadoras peristálticas. O dashboard publica um
// comando de dosagem manual; o firmware responde em dosagem/evento.
export type DoseChemical = "cloro" | "acido" | "base";

// Origem do comando de dosagem — auditoria. O dashboard sempre publica "manual".
export type DoseOrigin = "manual" | "automatico";

// Resultado normalizado exibido na UI (derivado do evento do firmware).
export type DoseResult = "ok" | "erro" | "bloqueado";

// Evento bruto reportado pelo firmware em dosagem/evento.
export type DoseEvent = "iniciada" | "concluida" | "bloqueada";

// Comando que o DASHBOARD publica em aquasense-ibmec-pt/dosagem/comando.
export interface DosingCommand {
  parametro: DoseChemical;
  origem: DoseOrigin;
  comando_id: string;
}

// Evento do firmware em aquasense-ibmec-pt/dosagem/evento.
export interface DosingResponse {
  t: number; // timestamp local (Date.now()) da chegada
  parametro?: DoseChemical;
  evento: DoseEvent;
  resultado: DoseResult; // derivado de `evento` para exibição
  motivo?: string;
  fonte?: string;
}

// Valor sentinela publicado pelo firmware quando um sensor falha.
export const SENSOR_ERROR_VALUE = -99.0;

export function isSensorError(v: number | undefined | null): boolean {
  return v === undefined || v === null || v <= -50;
}

// Tipos auxiliares para o provider.
export type MqttConnectionStatus = "connecting" | "connected" | "disconnected" | "error";
export type DataSource = "mqtt" | "fallback" | "none";

export interface MqttLogEntry {
  t: number;
  topic: string;
  payload: string;
}

// Ids estáveis dos sensores rastreados no diagnóstico (online/offline + falhas).
export type SensorId = "ph" | "cloro" | "alcalinidade" | "piscina" | "coletor";

// Contadores de falha (leituras com valor sentinela de erro) por sensor,
// acumulados na sessão. Usado pelos indicadores do painel de Diagnóstico.
export type SensorFailureCounts = Record<SensorId, number>;

export interface MqttContextValue {
  status: MqttConnectionStatus;
  source: DataSource;
  lastMessageAt: number | null;
  cycle: number | null;
  log: MqttLogEntry[];
  // Última mensagem consolidada (snapshot) já parseada.
  data: AquaSenseData | null;
  // Detecção de buracos na sequência de ciclos (ver src/lib/cycleGaps.ts).
  gaps: import("@/lib/cycleGaps").GapEvent[];
  totalGaps: number;
  // Quantas mensagens VÁLIDAS de snapshot foram processadas desde o mount.
  messagesReceivedCount: number;
  providerMountedAt: number;
  // Respostas de dosagem recebidas em alexa/resposta (FIFO, mais recente em [0]).
  dosingResponses: DosingResponse[];
  // Contadores de falha por sensor (leitura = valor de erro), acumulados na sessão.
  sensorFailures: SensorFailureCounts;
  // Publica um comando de dosagem manual. Throttle de 1s; rejeita quando
  // desconectado. Gera comando_id automaticamente.
  publishDosingCommand: (parameter: DoseChemical) => Promise<void>;
  // Publica o modo da BOMBA de aquecimento solar (controle/modo). Throttle de
  // 1s; rejeita quando desconectado.
  publishControlMode: (modo: "automatico" | "manual") => Promise<void>;
  // Publica o modo da DOSAGEM química (controle/dosagem/modo), independente da
  // bomba. Throttle de 1s; rejeita quando desconectado.
  publishDosingMode: (modo: "automatico" | "manual") => Promise<void>;
}
