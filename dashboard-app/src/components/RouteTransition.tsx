import { useEffect, useRef } from "react";
import { useLocation } from "@tanstack/react-router";
import { animate, stagger, MOTION } from "@/lib/motion";

// Per-page content settle: the wrapper fades + lifts in, then [data-tile]
// cards stagger-land. The full-screen vertical wipe between routes is handled
// separately by <RouteCurtain> in the persistent root layout — this just
// brings the incoming page's content in once it's revealed.
export function RouteTransition({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const location = useLocation();

  useEffect(() => {
    if (!ref.current) return;
    animate(ref.current, {
      opacity: [0, 1],
      translateY: [10, 0],
      duration: MOTION.duration.route,
      ease: MOTION.easeInOut,
    });
    const tiles = ref.current.querySelectorAll<HTMLElement>("[data-tile]");
    if (tiles.length) {
      animate(tiles, {
        translateY: [18, 0],
        duration: MOTION.duration.base,
        delay: stagger(55, { start: 160 }),
        ease: MOTION.ease,
      });
    }
  }, [location.pathname]);

  return (
    <div ref={ref} style={{ willChange: "transform, opacity" }}>
      {children}
    </div>
  );
}
