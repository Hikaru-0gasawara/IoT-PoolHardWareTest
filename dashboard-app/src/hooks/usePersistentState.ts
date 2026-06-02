import { useEffect, useRef, useState, useCallback, type Dispatch, type SetStateAction } from "react";

// Hook genérico de estado persistente em localStorage.
//
// Por que existir: várias preferências de UI (range de gráficos, filtro de
// alertas, etc.) viviam em useState puro e resetavam a cada navegação. O
// padrão "persistir em LS" se repetia com pequenas variações em cada lugar
// — algumas com try/catch, outras sem; algumas com SSR-safe, outras não.
// Centralizar elimina a inconsistência.
//
// Convenções:
//   - `key` deve usar prefixo "aquasense." para evitar colisão entre apps
//     servidos no mesmo origin (ex.: aquasense.charts.range).
//   - O `validate` é opcional mas recomendado para enums string: protege
//     contra valores legados quando o conjunto de opções é refatorado.
//   - Sem reidratar de outras abas (storage event) — overkill para o caso.
//
// SSR (TanStack Start): React reusa o resultado do SSR durante hidratação
// e NÃO reexecuta o initializer de useState no cliente. Se a leitura do
// localStorage acontecesse só no init, o valor salvo seria sempre ignorado.
// Por isso fazemos hidratação em duas fases:
//   1) primeiro render = `defaultValue` (mesmo SSR e cliente — sem mismatch)
//   2) useEffect monta, lê o LS e atualiza o estado se houver valor salvo
// O efeito de "salvar" é ignorado no primeiro mount via `hasHydratedRef`
// para não sobrescrever o LS com o default antes da fase 2 ler.

function readFromStorage<T>(key: string, fallback: T, validate?: (v: unknown) => v is T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw == null) return fallback;
    const parsed = JSON.parse(raw) as unknown;
    if (validate && !validate(parsed)) return fallback;
    return parsed as T;
  } catch {
    return fallback;
  }
}

export function usePersistentState<T>(
  key: string,
  defaultValue: T,
  validate?: (v: unknown) => v is T,
): [T, Dispatch<SetStateAction<T>>] {
  const [state, setState] = useState<T>(defaultValue);
  const hasHydratedRef = useRef(false);

  // Fase 2 da hidratação: lê o LS após mount e aplica se diferente do default.
  useEffect(() => {
    const stored = readFromStorage(key, defaultValue, validate);
    setState(stored);
    hasHydratedRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Não grava antes da fase 2 — senão sobrescreveríamos o valor salvo
    // com o `defaultValue` do primeiro render.
    if (!hasHydratedRef.current) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(state));
    } catch {
      // quota exceeded ou modo privado — falha silenciosa, comportamento
      // degrada para "estado em memória", que era o original mesmo.
    }
  }, [key, state]);

  // Wrapper estável — útil quando o consumidor precisa passar adiante por prop.
  const setStable = useCallback<Dispatch<SetStateAction<T>>>((v) => setState(v), []);

  return [state, setStable];
}