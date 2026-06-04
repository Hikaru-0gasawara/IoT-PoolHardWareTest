import { useEffect, useRef } from "react";
import { useLocation } from "@tanstack/react-router";
import { animate, stagger, MOTION } from "@/lib/motion";

// Route transition: page wrapper fades + slides up; individual [data-tile]
// elements stagger-slide in after the page is visible, giving each card a
// sequential landing effect without conflicting opacity (tiles use translateY
// only — opacity comes from the parent container).
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
