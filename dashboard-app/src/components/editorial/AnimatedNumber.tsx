import { useEffect, useRef } from "react";
import { animate as animeAnimate } from "animejs";
import { isMotionReduced } from "@/hooks/useReducedMotion";

interface Props {
  value: number;
  decimals: number;
  className?: string;
}

// Contador animado para os cards do dashboard. Quando o valor muda, faz uma
// contagem suave (count-up/down) do valor anterior até o novo e um micro-pop
// de escala — baixa intrusividade. Com "reduzir movimento" ativo, atualiza o
// texto instantaneamente, sem tween nem pop.
export function AnimatedNumber({ value, decimals, className }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef<number>(value);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const from = prev.current;
    prev.current = value;

    const safe = Number.isFinite(value) ? value.toFixed(decimals) : "—";

    if (isMotionReduced() || from === value || !Number.isFinite(from) || !Number.isFinite(value)) {
      el.textContent = safe;
      return;
    }

    const obj = { n: from };
    const a1 = animeAnimate(obj, {
      n: value,
      duration: 520,
      ease: "outQuad",
      onUpdate: () => {
        el.textContent = obj.n.toFixed(decimals);
      },
    });
    const a2 = animeAnimate(el, {
      scale: [1, 1.07, 1],
      duration: 420,
      ease: "outQuad",
    });

    // Cancela tweens órfãos se `value` mudar de novo ou o componente desmontar —
    // evita dois onUpdate disputando o mesmo textContent (flicker).
    return () => {
      try {
        a1.pause();
        a2.pause();
      } catch {
        /* noop */
      }
    };
  }, [value, decimals]);

  return (
    <span
      ref={ref}
      className={className}
      style={{ display: "inline-block", willChange: "transform" }}
    >
      {Number.isFinite(value) ? value.toFixed(decimals) : "—"}
    </span>
  );
}
