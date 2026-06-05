export const SIM = {
  TICK_MS: 5_000,
  LIVE_HISTORY_MAX: 60, // 5min live window at 5s ticks
  HISTORY_STEP_MS: 5 * 60 * 1000,
  HISTORY_MAX: 288, // ~24h at 5min intervals
  ANTI_CYCLING_S: 60, // min seconds between pump state changes
} as const;

export const CHLORINE = {
  DOSE_INTERVAL_TICKS: 6 * 60 * 12, // 6h in 5s ticks (4320)
  DOSE_AMOUNT: 1.0,
} as const;

export const POOL = {
  SETPOINT_MIN: 27,
  SETPOINT_MAX: 35,
  PUMP_LOG_MAX: 20,
  ALERT_MAX: 50,
  CLORO_EVENT_MAX: 30,
} as const;
