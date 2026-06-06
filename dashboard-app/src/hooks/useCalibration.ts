import { useCallback, useState } from "react";

// Calibração manual por parâmetro — referência local salva em localStorage.
// Em ambiente real, operador faria leitura paralela com kit colorimétrico
// e ajustaria offset do sensor. Aqui é educacional: mostra "leitura do
// sensor vs valor de referência manual" no card.

export type CalibrationParam = "ph" | "chlorine" | "alkalinity";

const DEFAULTS: Record<CalibrationParam, number> = {
  ph: 7.4,
  chlorine: 2.0,
  alkalinity: 100,
};

const storageKey = (param: CalibrationParam) => `aquasense.calibration.${param}`;

export function useCalibration(param: CalibrationParam) {
  // Leitura inicial síncrona — evita flicker do default antes do useEffect.
  // SSR-safe via guarda typeof window.
  const read = (): { value: number; isCustom: boolean } => {
    if (typeof window === "undefined") {
      return { value: DEFAULTS[param], isCustom: false };
    }
    try {
      const stored = window.localStorage.getItem(storageKey(param));
      if (stored === null) return { value: DEFAULTS[param], isCustom: false };
      const parsed = Number(stored);
      return Number.isFinite(parsed)
        ? { value: parsed, isCustom: true }
        : { value: DEFAULTS[param], isCustom: false };
    } catch {
      // localStorage bloqueado (modo privado) — usa o default
      return { value: DEFAULTS[param], isCustom: false };
    }
  };

  const [state, setState] = useState(read);

  const update = useCallback(
    (next: number) => {
      if (!Number.isFinite(next)) return;
      setState({ value: next, isCustom: true });
      try {
        window.localStorage.setItem(storageKey(param), String(next));
      } catch {
        // storage indisponível, segue só em memória
      }
    },
    [param],
  );

  return {
    value: state.value,
    isCustom: state.isCustom,
    update,
    defaultValue: DEFAULTS[param],
  };
}
