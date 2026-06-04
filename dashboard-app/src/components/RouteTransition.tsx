import { useEffect, useRef } from "react";
import { useLocation } from "@tanstack/react-router";
import { animate, MOTION } from "@/lib/motion";

// Transição de rota com anime.js. A cada mudança de pathname, o conteúdo
// principal faz um fade + leve subida, com duração e easing consistentes
// (MOTION.duration.route / MOTION.easeInOut) entre /, /graficos, /controle,
// /alertas e /config. Respeita "reduzir movimento" via wrapper `animate`.
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
  }, [location.pathname]);

  return (
    <div ref={ref} style={{ willChange: "transform, opacity" }}>
      {children}
    </div>
  );
}
