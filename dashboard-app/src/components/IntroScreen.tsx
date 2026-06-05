import { useEffect, useRef, useState } from "react";
import { animate, MOTION } from "@/lib/motion";
import { isMotionReduced } from "@/hooks/useReducedMotion";

const SS_KEY = "aquasense.intro-seen";

// Active Theory-inspired loading screen.
// Module-level flag prevents React Strict Mode's double-effect from firing
// the "should we show?" logic twice. The flag is reset on every page load
// (module reload), but persists within a single React tree lifecycle so that
// the second Strict Mode invocation is a no-op.
let introDecided = false;

export function IntroScreen() {
  const [done, setDone] = useState(true);
  const rootRef = useRef<HTMLDivElement>(null);
  const barFillRef = useRef<HTMLDivElement>(null);
  const counterRef = useRef<HTMLSpanElement>(null);
  const wipeRef = useRef<HTMLDivElement>(null);
  const subRef = useRef<HTMLParagraphElement>(null);
  const infoRef = useRef<HTMLDivElement>(null);
  const cornersRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (introDecided) return;
    introDecided = true;
    let seen = true;
    try {
      seen = sessionStorage.getItem(SS_KEY) === "1";
    } catch {
      seen = false;
    }
    if (seen) {
      setDone(true);
      return;
    }
    setDone(false);
    try {
      sessionStorage.setItem(SS_KEY, "1");
    } catch {
      /* sessionStorage indisponível (modo privado) */
    }
  }, []);

  useEffect(() => {
    if (done) return;
    const reduced = isMotionReduced();
    const clear: (() => void)[] = [];

    if (reduced) {
      // Reduced-motion: show the fully-composed screen for 1.5 s so it's
      // actually visible, then dismiss without animation.
      if (counterRef.current) counterRef.current.textContent = "100%";
      if (barFillRef.current) barFillRef.current.style.transform = "scaleX(1)";
      if (wipeRef.current) wipeRef.current.style.transform = "scaleX(0)";
      if (subRef.current) subRef.current.style.opacity = "1";
      if (infoRef.current) infoRef.current.style.opacity = "1";
      if (cornersRef.current) cornersRef.current.style.opacity = "1";
      const t = window.setTimeout(() => setDone(true), 1500);
      return () => window.clearTimeout(t);
    }

    const FILL_MS = 1100;

    if (cornersRef.current) {
      animate(cornersRef.current, {
        opacity: [0, 1],
        duration: 400,
        ease: MOTION.ease,
      });
    }

    if (barFillRef.current) {
      animate(barFillRef.current, {
        scaleX: [0, 1],
        duration: FILL_MS,
        ease: "linear",
      });
    }

    const t0 = performance.now();
    let raf: number;
    const countUp = (now: number) => {
      const p = Math.min((now - t0) / FILL_MS, 1);
      if (counterRef.current) counterRef.current.textContent = `${Math.floor(p * 100)}%`;
      if (p < 1) raf = requestAnimationFrame(countUp);
    };
    raf = requestAnimationFrame(countUp);
    clear.push(() => cancelAnimationFrame(raf));

    if (wipeRef.current) {
      animate(wipeRef.current, {
        scaleX: [1, 0],
        duration: 320,
        delay: FILL_MS + 60,
        ease: "outCubic",
      });
    }

    if (subRef.current) {
      animate(subRef.current, {
        opacity: [0, 1],
        translateY: [6, 0],
        duration: 280,
        delay: FILL_MS + 320,
        ease: MOTION.ease,
      });
    }

    if (infoRef.current) {
      animate(infoRef.current, {
        opacity: [0, 1],
        duration: 300,
        delay: FILL_MS + 420,
        ease: MOTION.ease,
      });
    }

    const hold = FILL_MS + 1600;
    const exitId = window.setTimeout(() => {
      if (!rootRef.current) {
        setDone(true);
        return;
      }
      animate(rootRef.current, {
        opacity: [1, 0],
        duration: 500,
        ease: MOTION.easeInOut,
        onComplete: () => setDone(true),
      });
    }, hold);
    clear.push(() => window.clearTimeout(exitId));

    return () => clear.forEach((fn) => fn());
  }, [done]);

  if (done) return null;

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden"
      style={{ backgroundColor: "var(--aqua-bg)" }}
      role="presentation"
      aria-hidden
    >
      <div ref={cornersRef} aria-hidden style={{ opacity: 0 }}>
        <Corner pos="tl" />
        <Corner pos="tr" />
        <Corner pos="bl" />
        <Corner pos="br" />
      </div>

      <div className="relative w-full max-w-lg px-10">
        <div className="relative overflow-hidden">
          <h1 className="font-display text-[3.5rem] font-semibold tracking-tight text-aqua-text sm:text-[5rem] leading-none">
            AquaSense
          </h1>
          <div
            ref={wipeRef}
            aria-hidden
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundColor: "var(--aqua-bg)",
              transformOrigin: "right center",
            }}
          />
        </div>

        <p
          ref={subRef}
          className="mt-2 text-[11px] uppercase tracking-[0.22em] text-aqua-text-muted"
          style={{ opacity: 0 }}
        >
          IoT · Pool Monitor
        </p>

        <div className="mt-10">
          <div className="relative h-px w-full" style={{ backgroundColor: "var(--aqua-border)" }}>
            <div
              ref={barFillRef}
              className="absolute inset-y-0 left-0 w-full"
              style={{
                backgroundColor: "var(--aqua-accent)",
                transformOrigin: "left center",
                transform: "scaleX(0)",
                boxShadow: "0 0 6px 0px var(--aqua-accent)",
              }}
            />
          </div>

          <div className="mt-2 flex items-center justify-between">
            <span
              ref={counterRef}
              className="font-tabular text-[11px] tabular-nums text-aqua-text-muted"
            >
              0%
            </span>
            <div
              ref={infoRef}
              className="flex items-center gap-2 text-[9px] uppercase tracking-[0.22em] text-aqua-text-muted"
              style={{ opacity: 0 }}
            >
              <span>v1.2.3</span>
              <span className="opacity-30">·</span>
              <span>ESP32</span>
              <span className="opacity-30">·</span>
              <span>MQTT</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Corner({ pos }: { pos: "tl" | "tr" | "bl" | "br" }) {
  const SIZE = 16;
  const style: React.CSSProperties = {
    position: "fixed",
    width: SIZE,
    height: SIZE,
    opacity: 0.35,
    borderColor: "var(--aqua-accent)",
    borderStyle: "solid",
    borderWidth: 0,
    ...(pos === "tl" && { top: 20, left: 20, borderTopWidth: 1, borderLeftWidth: 1 }),
    ...(pos === "tr" && { top: 20, right: 20, borderTopWidth: 1, borderRightWidth: 1 }),
    ...(pos === "bl" && { bottom: 20, left: 20, borderBottomWidth: 1, borderLeftWidth: 1 }),
    ...(pos === "br" && { bottom: 20, right: 20, borderBottomWidth: 1, borderRightWidth: 1 }),
  };
  return <div aria-hidden style={style} />;
}
