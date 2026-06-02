// useHoldToConfirm — gerencia hold-to-confirm para comandos críticos.
//
// Por que existir: comandos de dosagem química em piscina real são
// irreversíveis (LED ligar é trivial, "ácido na piscina" não). Hold-to-confirm
// elimina o duplo-clique acidental sem o atrito de um modal a cada ação.
//
// Comportamento:
//   - onPointerDown inicia timer + atualiza progresso (0→1) via rAF
//   - se completar (>= durationMs), chama onConfirm() exatamente uma vez
//   - cancelamento (pointerup, pointerleave, blur) reseta progresso
//   - disabled bloqueia start; cancelamento também rejeita comandos em voo
//
// Não usa setTimeout para o progresso — rAF dá animação suave a 60fps
// e cancelamento limpo via cancelAnimationFrame.

import { useCallback, useEffect, useRef, useState } from "react";

export interface UseHoldToConfirmOptions {
  durationMs?: number;
  onConfirm: () => void | Promise<void>;
  disabled?: boolean;
}

export interface UseHoldToConfirmReturn {
  /** 0 → 1 conforme tempo segurando avança */
  progress: number;
  /** true enquanto usuário está segurando (mesmo se ainda não completou) */
  isHolding: boolean;
  /** Handlers para colar no botão */
  handlers: {
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerUp: () => void;
    onPointerLeave: () => void;
    onPointerCancel: () => void;
    onKeyDown: (e: React.KeyboardEvent) => void;
    onKeyUp: (e: React.KeyboardEvent) => void;
    onBlur: () => void;
  };
}

export function useHoldToConfirm({
  durationMs = 1500,
  onConfirm,
  disabled = false,
}: UseHoldToConfirmOptions): UseHoldToConfirmReturn {
  const [progress, setProgress] = useState(0);
  const [isHolding, setIsHolding] = useState(false);

  const rafRef = useRef<number | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const firedRef = useRef(false);
  const onConfirmRef = useRef(onConfirm);
  onConfirmRef.current = onConfirm;

  const cancel = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    startedAtRef.current = null;
    firedRef.current = false;
    setIsHolding(false);
    setProgress(0);
  }, []);

  const tick = useCallback(() => {
    if (startedAtRef.current === null) return;
    const elapsed = performance.now() - startedAtRef.current;
    const p = Math.min(1, elapsed / durationMs);
    setProgress(p);
    if (p >= 1) {
      if (!firedRef.current) {
        firedRef.current = true;
        // Chama onConfirm e imediatamente reseta visual.
        // Erros do onConfirm são intencionalmente engolidos aqui — quem
        // chama é responsável por sinalizar via toast/UI. O hook só lida
        // com o gesto, não com o resultado do comando.
        try {
          void onConfirmRef.current();
        } catch {
          /* ignore */
        }
      }
      cancel();
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [durationMs, cancel]);

  const start = useCallback(() => {
    if (disabled || startedAtRef.current !== null) return;
    firedRef.current = false;
    startedAtRef.current = performance.now();
    setIsHolding(true);
    setProgress(0);
    rafRef.current = requestAnimationFrame(tick);
  }, [disabled, tick]);

  // Cleanup no unmount — evita rAF órfão se botão desmontar mid-hold.
  useEffect(() => cancel, [cancel]);

  // Se ficar disabled mid-hold, cancela (ex: comando inflight ou perda MQTT).
  useEffect(() => {
    if (disabled) cancel();
  }, [disabled, cancel]);

  return {
    progress,
    isHolding,
    handlers: {
      onPointerDown: (e) => {
        // Apenas botão primário (mouse esquerdo, touch, pen).
        if (e.button !== undefined && e.button !== 0) return;
        start();
      },
      onPointerUp: cancel,
      onPointerLeave: cancel,
      onPointerCancel: cancel,
      onKeyDown: (e) => {
        if ((e.key === " " || e.key === "Enter") && !e.repeat) {
          e.preventDefault();
          start();
        }
      },
      onKeyUp: (e) => {
        if (e.key === " " || e.key === "Enter") cancel();
      },
      onBlur: cancel,
    },
  };
}
