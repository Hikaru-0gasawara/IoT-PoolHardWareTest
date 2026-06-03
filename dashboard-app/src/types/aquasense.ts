// AquaSense IoT — Tipos de domínio
// Toda a UI consome destes tipos. Não inventar campos extras nos componentes.

export type ParameterKey = "ph" | "cloro" | "alcalinidade" | "temp_piscina" | "temp_coletor";

export type StatusLevel = "ok" | "warn" | "crit";

export type PumpMode = "automatico" | "manual";

export interface SensorPoint {
  t: number; // epoch ms
  ph: number;
  cloro: number;
  alcalinidade: number;
  temp_piscina: number;
  temp_coletor: number;
  bomba_ligada: boolean;
}

export interface PumpEvent {
  t: number;
  ligada: boolean;
  motivo: string; // ex: "Auto: ΔT 12.4°C ≥ 5°C"
}

export type AlertSeverity = "info" | "warn" | "crit";
export type AlertStatus = "ativo" | "resolvido";

// AggregatedAlert — modelo de alertas agregados por (parametro, severity).
// Regras (governadas por poolStore._processAggregatedAlerts):
//   - Abre quando ciclos_consecutivos_fora >= 3 (≈15s a 5s/ciclo).
//   - Resolve quando ciclos_consecutivos_dentro >= 5 (≈25s).
//   - Escala warn→crit in-place (mantém iniciado_em, zera ack_em).
//   - Não desescala crit→warn enquanto fora da faixa.
//   - ack_em apenas silencia destaque visual; não fecha o alerta.
export interface AggregatedAlert {
  id: string; // `${parametro}:${severity}` no momento da abertura
  parametro: ParameterKey;
  severity: "warn" | "crit";
  severity_max: "warn" | "crit"; // pior severidade já vista neste evento
  status: AlertStatus;
  iniciado_em: number;
  ultimo_update_t: number;
  resolvido_em: number | null;
  ack_em: number | null;
  ciclos_consecutivos_fora: number;
  ciclos_consecutivos_dentro: number;
  ocorrencias: number; // ciclos fora desde abertura
  valor_atual: number;
  valor_min: number; // pico mínimo observado
  valor_max: number; // pico máximo observado
  faixa_ideal: { min: number; max: number };
  unidade: string;
}

// Compat: alguns componentes legados ainda referenciam Alert.
export type Alert = AggregatedAlert;

export interface Thresholds {
  idealMin: number;
  idealMax: number;
  warnMin: number;
  warnMax: number;
  // fora de [warnMin, warnMax] = crítico
  rangeMin: number; // sensor range
  rangeMax: number;
  unit: string;
  label: string;
  color: string; // var(--param-...)
}

export interface PoolState {
  // leituras atuais
  ph: number;
  cloro: number;
  orp_mv: number;
  alcalinidade: number;
  temp_piscina: number;
  temp_coletor: number;
  delta_t: number;

  // bomba
  bomba_ligada: boolean;
  bomba_modo: PumpMode;
  setpoint_temp: number;
  ultima_mudanca_bomba_t: number; // epoch ms — para anti-cycling
  bomba_estado_desde_t: number; // epoch ms — quando entrou no estado atual

  // sistema
  status_geral: StatusLevel;
  ultima_atualizacao_t: number;
  uptime_s: number;
  firmware: string;

  // séries históricas (rolling)
  history: SensorPoint[]; // últimas ~24h em granularidade de 5min
  liveHistory: SensorPoint[]; // últimos ~60 pontos em granularidade de 5s (sparkline)

  // eventos
  pumpLog: PumpEvent[];
  alerts: AggregatedAlert[];

  // recém-disparados (para animação)
  lastTickAt: number;
}
