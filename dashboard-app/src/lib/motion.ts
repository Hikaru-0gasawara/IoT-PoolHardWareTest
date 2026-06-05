import {
  animate as animeAnimate,
  utils,
  createSpring,
  createTimeline as animeCreateTimeline,
  stagger as animeStagger,
} from "animejs";
import { isMotionReduced } from "@/hooks/useReducedMotion";

export const MOTION = {
  ease: "outQuad" as const,
  easeInOut: "inOutQuad" as const,
  // smooth — default for ΔT markers, route transitions
  spring: createSpring({ stiffness: 80, damping: 18 }),
  // snappy — hover micro-interactions, nav active state
  springMicro: createSpring({ stiffness: 220, damping: 28 }),
  // elastic — celebratory pops (dose complete, status flip)
  springBounce: createSpring({ stiffness: 55, damping: 8 }),
  duration: {
    fast: 180,
    base: 320,
    route: 380,
  },
} as const;

type Targets = Parameters<typeof animeAnimate>[0];
type Params = Parameters<typeof animeAnimate>[1];

function extractFinals(params: Record<string, unknown>): Record<string, unknown> {
  const skip = new Set([
    "duration",
    "delay",
    "ease",
    "easing",
    "loop",
    "alternate",
    "autoplay",
    "onComplete",
    "onBegin",
    "onUpdate",
    "composition",
  ]);
  const finals: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (skip.has(key)) continue;
    if (value && typeof value === "object" && "to" in (value as object)) {
      finals[key] = (value as { to: unknown }).to;
    } else if (Array.isArray(value)) {
      finals[key] = value[value.length - 1];
    } else {
      finals[key] = value;
    }
  }
  return finals;
}

// Wraps anime.js animate() — applies final values immediately when
// reduced-motion is active instead of running the tween.
export function animate(targets: Targets, params: Params) {
  if (isMotionReduced()) {
    try {
      utils.set(targets, extractFinals(params as Record<string, unknown>) as Params);
    } catch {
      // target not in DOM — ignore
    }
    const onComplete = (params as { onComplete?: (...a: unknown[]) => void })?.onComplete;
    if (typeof onComplete === "function") onComplete();
    return null;
  }
  return animeAnimate(targets, params);
}

// Wraps createTimeline — each .add() still applies finals immediately
// when reduced-motion is active so elements don't stay invisible.
type TimelineParams = Parameters<typeof animeCreateTimeline>[0];
type TimelineAddParams = Record<string, unknown>;

interface NoopTimeline {
  add(targets: unknown, props: TimelineAddParams, offset?: unknown): NoopTimeline;
}

function makeNoopTimeline(): NoopTimeline {
  const noop: NoopTimeline = {
    add(targets, props) {
      try {
        utils.set(targets as Targets, extractFinals(props) as Params);
      } catch {
        // ignore
      }
      return noop;
    },
  };
  return noop;
}

export function createTimeline(params?: TimelineParams) {
  if (isMotionReduced()) return makeNoopTimeline();
  return animeCreateTimeline(params);
}

// Re-exports for direct use in components.
export { animeStagger as stagger, utils as animeUtils };
