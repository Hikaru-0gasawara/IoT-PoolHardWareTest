import { useSyncExternalStore, useCallback } from "react";

// Fonte única de verdade para "reduzir movimento". Combina duas entradas:
//   1) prefers-reduced-motion do SO (reativo via matchMedia listener)
//   2) preferência explícita do usuário, persistida em localStorage
//      ("system" | "on" | "off") — sobrepõe o SO quando "on"/"off".
//
// Implementado como store de módulo + useSyncExternalStore para que o toggle
// no header propague instantaneamente para todos os componentes (cards, menu,
// transições de rota) sem precisar de Context/provider.

const LS_KEY = "aquasense.reduce-motion";

export type MotionPreference = "system" | "on" | "off";

let preference: MotionPreference = "system";
let systemReduced = false;
let initialized = false;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function computeReduced(): boolean {
  if (preference === "on") return true;
  if (preference === "off") return false;
  return systemReduced;
}

function applyAttr() {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-reduce-motion", computeReduced() ? "true" : "false");
}

function init() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  try {
    const v = window.localStorage.getItem(LS_KEY);
    if (v === "on" || v === "off" || v === "system") preference = v;
  } catch {
    // localStorage indisponível — segue com "system"
  }
  if (typeof window.matchMedia === "function") {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    systemReduced = mq.matches;
    const onChange = (e: MediaQueryListEvent) => {
      systemReduced = e.matches;
      applyAttr();
      emit();
    };
    if (typeof mq.addEventListener === "function") mq.addEventListener("change", onChange);
    else if (typeof mq.addListener === "function") mq.addListener(onChange);
  }
  applyAttr();
}

export function setMotionPreference(p: MotionPreference) {
  preference = p;
  try {
    window.localStorage.setItem(LS_KEY, p);
  } catch {
    // ignore
  }
  applyAttr();
  emit();
}

function subscribe(cb: () => void) {
  init();
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

// Snapshot estável: retorna primitivos (boolean / string).
function getReducedSnapshot(): boolean {
  init();
  return computeReduced();
}
function getPrefSnapshot(): MotionPreference {
  init();
  return preference;
}

export function useReducedMotion() {
  const reduced = useSyncExternalStore(subscribe, getReducedSnapshot, () => false);
  const preferenceValue = useSyncExternalStore(
    subscribe,
    getPrefSnapshot,
    () => "system" as MotionPreference,
  );
  const setPreference = useCallback((p: MotionPreference) => setMotionPreference(p), []);
  return { reduced, preference: preferenceValue, setPreference };
}

// Leitura imperativa (fora de React) — usada pelo wrapper de animação para
// decidir se executa ou pula direto ao estado final.
export function isMotionReduced(): boolean {
  init();
  return computeReduced();
}
