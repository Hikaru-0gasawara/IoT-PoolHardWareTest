// Persistência de preferências do dashboard (localStorage) — extraída do
// poolStore. Apenas estas chaves são persistidas; o resto do estado é volátil
// (reconstruído a cada sessão). SSR-safe: no-op quando `window` não existe.

import type { PumpMode } from "@/types/aquasense";

const LS_KEY = "aquasense:settings:v1";

export interface PersistedSettings {
  setpoint_temp: number;
  bomba_modo: PumpMode;
  dosagem_modo: PumpMode;
  ackedAlerts: string[];
  theme: "dark" | "dark-black" | "light";
}

export function loadSettings(): Partial<PersistedSettings> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveSettings(s: Partial<PersistedSettings>) {
  if (typeof window === "undefined") return;
  try {
    const cur = loadSettings();
    localStorage.setItem(LS_KEY, JSON.stringify({ ...cur, ...s }));
  } catch {
    /* ignore */
  }
}
