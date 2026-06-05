import { useEffect, useRef } from "react";
import { useLocation } from "@tanstack/react-router";
import { animate, animeUtils, MOTION } from "@/lib/motion";
import { isMotionReduced } from "@/hooks/useReducedMotion";

const ROUTE_LABELS: Array<[string, string]> = [
  ["/graficos", "Gráficos"],
  ["/alertas", "Alertas"],
  ["/config", "Configurações"],
  ["/integracoes", "Integrações"],
  ["/controle", "Controle"],
];

function labelForPath(path: string): string {
  if (path === "/") return "Visão Geral";
  const hit = ROUTE_LABELS.find(([prefix]) => path.startsWith(prefix));
  return hit ? hit[1] : "AquaSense";
}

const COVER_MS = 380;
const HOLD_MS = 90;
const REVEAL_MS = 460;

export function RouteCurtain() {
  const panelRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const prevPath = useRef<string | null>(null);

  useEffect(() => {
    const panel = panelRef.current;
    // Snapshot the previous path before any writes so cleanup can restore it.
    // This makes the effect idempotent across React Strict Mode's double-fire:
    // cleanup resets prevPath so the second invocation sees the same state as
    // the first and re-runs the animation cleanly.
    const prevPathSnapshot = prevPath.current;
    const isFirst = prevPathSnapshot === null;
    const changed = prevPathSnapshot !== location.pathname;
    prevPath.current = location.pathname;

    if (isFirst || !changed || !panel) {
      return () => {
        prevPath.current = prevPathSnapshot;
      };
    }

    const label = labelRef.current;
    if (label) label.textContent = labelForPath(location.pathname);

    const timers: number[] = [];

    // Reduced-motion: skip the panel sweep but briefly flash the route label
    // so there's still a clear visual signal of the navigation.
    if (isMotionReduced()) {
      if (label) {
        label.style.opacity = "1";
        label.style.transform = "none";
        const id = window.setTimeout(() => {
          if (label) label.style.opacity = "0";
        }, 700);
        timers.push(id);
      }
      return () => {
        prevPath.current = prevPathSnapshot;
        timers.forEach((id) => window.clearTimeout(id));
      };
    }

    if (label) {
      animeUtils.set(label, { opacity: 0, translateY: 24 });
      animate(label, {
        opacity: [0, 1],
        translateY: [24, 0],
        duration: 260,
        delay: 70,
        ease: MOTION.ease,
      });
    }

    animeUtils.set(panel, { translateY: "100%" });
    animate(panel, {
      translateY: ["100%", "0%"],
      duration: COVER_MS,
      ease: MOTION.easeInOut,
      onComplete: () => {
        const id = window.setTimeout(() => {
          animate(panel, {
            translateY: ["0%", "-100%"],
            duration: REVEAL_MS,
            ease: MOTION.easeInOut,
            onComplete: () => animeUtils.set(panel, { translateY: "100%" }),
          });
          if (label) {
            animate(label, {
              opacity: [1, 0],
              translateY: [0, -24],
              duration: 240,
              ease: MOTION.ease,
            });
          }
        }, HOLD_MS);
        timers.push(id);
      },
    });

    return () => {
      // Reset so Strict Mode's second effect call re-derives the same "before"
      // state and can restart the animation from scratch.
      prevPath.current = prevPathSnapshot;
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [location.pathname]);

  return (
    <div
      ref={panelRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center"
      style={{
        transform: "translateY(100%)",
        backgroundColor: "var(--aqua-bg)",
        willChange: "transform",
      }}
    >
      <div
        className="absolute inset-x-0 top-0 h-px"
        style={{
          backgroundColor: "var(--aqua-accent)",
          boxShadow: "0 0 12px 0 var(--aqua-accent)",
        }}
      />
      <div
        ref={labelRef}
        className="px-8 text-center font-display text-5xl font-semibold tracking-tight text-aqua-text sm:text-7xl"
        style={{ opacity: 0, willChange: "transform, opacity" }}
      >
        AquaSense
      </div>
    </div>
  );
}
