import { animate as animeAnimate, utils, createSpring } from "animejs";
import { isMotionReduced } from "@/hooks/useReducedMotion";

// Wrapper único sobre anime.js (v4). Centraliza duas garantias:
//   1) Acessibilidade: quando "reduzir movimento" está ativo (toggle do
//      usuário OU prefers-reduced-motion do SO), as animações NÃO rodam —
//      em vez disso o alvo é colocado imediatamente no estado final, mantendo
//      o mesmo layout/resultado visual sem transição.
//   2) Consistência: easing e durações padrão num só lugar para reuso.

export const MOTION = {
  // Easing e durações compartilhados para sensação coerente em todo o app.
  ease: "outQuad" as const,
  easeInOut: "inOutQuad" as const,
  spring: createSpring({ stiffness: 80, damping: 18 }),
  duration: {
    fast: 180,
    base: 320,
    route: 380,
  },
} as const;

type Targets = Parameters<typeof animeAnimate>[0];
type Params = Parameters<typeof animeAnimate>[1];

// Executa uma animação respeitando "reduzir movimento".
// Quando reduzido: aplica as propriedades finais instantaneamente (sem tween),
// dispara onComplete e retorna null.
export function animate(targets: Targets, params: Params) {
  if (isMotionReduced()) {
    const finals: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(params as Record<string, unknown>)) {
      if (
        key === "duration" || key === "delay" || key === "ease" ||
        key === "easing" || key === "loop" || key === "alternate" ||
        key === "autoplay" || key === "onComplete" || key === "onBegin" ||
        key === "onUpdate" || key === "composition"
      ) {
        continue;
      }
      // Suporta forma {to,from} ou array [from,to] ou valor simples.
      if (value && typeof value === "object" && "to" in (value as object)) {
        finals[key] = (value as { to: unknown }).to;
      } else if (Array.isArray(value)) {
        finals[key] = value[value.length - 1];
      } else {
        finals[key] = value;
      }
    }
    try {
      utils.set(targets, finals as Params);
    } catch {
      // alvo inexistente — ignore
    }
    const onComplete = (params as { onComplete?: (...a: unknown[]) => void })?.onComplete;
    if (typeof onComplete === "function") onComplete();
    return null;
  }
  return animeAnimate(targets, params);
}

export { utils as animeUtils };
