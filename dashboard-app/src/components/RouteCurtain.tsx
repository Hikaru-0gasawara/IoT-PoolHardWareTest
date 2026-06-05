import { useEffect, useRef } from "react";
import { useLocation } from "@tanstack/react-router";
import { animate, animeUtils, MOTION } from "@/lib/motion";
import { isMotionReduced } from "@/hooks/useReducedMotion";

// Editorial route transition (onlygenius.es-inspired). A solid panel sweeps up
// from the bottom — covering the outgoing page — then keeps travelling off the
// top to reveal the new one, in one continuous vertical wipe. A large display
// label announces the destination during the sweep.
//
// This lives in the persistent RootComponent (next to <Outlet/>) rather than
// inside the per-route <AppShell>, so the panel node never unmounts between
// navigations — letting a single ref track the previous path reliably.

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

// Cover then reveal, with a short hold at full coverage so the page swap
// underneath is never visible.
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
    const isFirst = prevPath.current === null;
    const changed = prevPath.current !== location.pathname;
    prevPath.current = location.pathname;

    // Skip the curtain on first paint and when motion is reduced.
    if (isFirst || !changed || isMotionReduced() || !panel) return;

    const label = labelRef.current;
    if (label) label.textContent = labelForPath(location.pathname);

    const timers: number[] = [];

    // Label fades up during the cover phase.
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

    // Cover: rise from below to fully cover the viewport...
    animeUtils.set(panel, { translateY: "100%" });
    animate(panel, {
      translateY: ["100%", "0%"],
      duration: COVER_MS,
      ease: MOTION.easeInOut,
      onComplete: () => {
        // ...hold briefly, then reveal by sliding off the top edge. Cover and
        // reveal are chained (not two same-tick tweens) — anime's default
        // "replace" composition would otherwise cancel the first.
        const id = window.setTimeout(() => {
          animate(panel, {
            translateY: ["0%", "-100%"],
            duration: REVEAL_MS,
            ease: MOTION.easeInOut,
            // Park back below the fold, ready for the next navigation.
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

    return () => timers.forEach((id) => window.clearTimeout(id));
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
      {/* thin accent edge leads the sweep */}
      <div
        className="absolute inset-x-0 top-0 h-px"
        style={{ backgroundColor: "var(--aqua-accent)", boxShadow: "0 0 12px 0 var(--aqua-accent)" }}
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
