import { useEffect, useRef } from "react";
import { Link } from "@tanstack/react-router";
import { animate, MOTION } from "@/lib/motion";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { cn } from "@/lib/utils";

interface NavItemProps {
  to: string;
  label: string;
  active: boolean;
  testId: string;
}

// Item de menu com realce suave via anime.js. O sublinhado (scaleX) e um leve
// "lift" no hover dão feedback de interação; ao tornar-se ativo, o item recebe
// um micro-pop. Quando "reduzir movimento" está ligado, o wrapper `animate`
// aplica o estado final instantaneamente — sem transição, mesmo resultado.
export function NavItem({ to, label, active, testId }: NavItemProps) {
  const linkRef = useRef<HTMLAnchorElement>(null);
  const barRef = useRef<HTMLSpanElement>(null);
  const { reduced } = useReducedMotion();

  // Mantém o sublinhado coerente com o estado ativo (e reage ao toggle).
  useEffect(() => {
    if (!barRef.current) return;
    animate(barRef.current, {
      scaleX: active ? 1 : 0,
      opacity: active ? 1 : 0,
      duration: MOTION.duration.fast,
      ease: MOTION.easeInOut,
    });
    if (active && linkRef.current) {
      animate(linkRef.current, {
        scale: [1, 1.06, 1],
        duration: MOTION.duration.base,
        ease: MOTION.easeInOut,
      });
    }
  }, [active, reduced]);

  const handleEnter = () => {
    if (!linkRef.current) return;
    animate(linkRef.current, {
      scale: 1.05,
      duration: MOTION.duration.fast,
      ease: MOTION.springMicro,
    });
    if (!active && barRef.current) {
      animate(barRef.current, {
        scaleX: 0.6,
        opacity: 0.5,
        duration: MOTION.duration.fast,
        ease: MOTION.springMicro,
      });
    }
  };

  const handleLeave = () => {
    if (linkRef.current) {
      animate(linkRef.current, {
        scale: 1,
        duration: MOTION.duration.fast,
        ease: MOTION.springMicro,
      });
    }
    if (!active && barRef.current) {
      animate(barRef.current, {
        scaleX: 0,
        opacity: 0,
        duration: MOTION.duration.fast,
        ease: MOTION.springMicro,
      });
    }
  };

  return (
    <Link
      ref={linkRef}
      to={to}
      data-testid={testId}
      data-active={active ? "true" : "false"}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      onFocus={handleEnter}
      onBlur={handleLeave}
      className={cn(
        "relative rounded-lg px-3 py-1.5 text-sm transition-colors will-change-transform",
        active ? "bg-aqua-surface-2 text-aqua-text" : "text-aqua-text-muted hover:text-aqua-text",
      )}
    >
      {label}
      <span
        ref={barRef}
        aria-hidden
        className="pointer-events-none absolute bottom-0.5 left-3 right-3 h-0.5 origin-left rounded-full bg-aqua-accent"
        style={{ transform: "scaleX(0)", opacity: 0 }}
      />
    </Link>
  );
}
