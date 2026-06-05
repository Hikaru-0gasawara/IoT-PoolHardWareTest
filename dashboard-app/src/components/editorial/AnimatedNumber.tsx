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

    if (isMotionReduced() || from === value || !Number.isFinite(from)) {
      el.textContent = value.toFixed(decimals);
      return;
    }

    const obj = { n: from };
    animeAnimate(obj, {
      n: value,
      duration: 520,
      ease: "outQuad",
      onUpdate: () => {
        el.textContent = obj.n.toFixed(decimals);
      },
    });
    animeAnimate(el, {
      scale: [1, 1.07, 1],
      duration: 420,
      ease: "outQuad",
    });
  }, [value, decimals]);

  return (
    <span
      ref={ref}
      className={className}
      style={{ display: "inline-block", willChange: "transform" }}
    >
      {value.toFixed(decimals)}
    </span>
  );
}
