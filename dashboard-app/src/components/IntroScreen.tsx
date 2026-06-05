import { useEffect, useRef, useState } from "react";
import { animate, MOTION } from "@/lib/motion";
import { isMotionReduced } from "@/hooks/useReducedMotion";

const SS_KEY = "aquasense.intro-seen";

// Active Theory-inspired loading screen:
// 1. Dark empty stage with HUD corner marks
// 2. Progress bar (1px) fills left→right over 1 second with count-up %
// 3. Title reveals via horizontal wipe overlay (300ms)
// 4. Sub-label + version info fade in
// 5. Hold → opacity fade out

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
    let seen = true;
    try { seen = sessionStorage.getItem(SS_KEY) === "1"; } catch { seen = false; }
    if (seen) { setDone(true); return; }
    setDone(false);
    try { sessionStorage.setItem(SS_KEY, "1"); } catch {}
  }, []);

  useEffect(() => {
    if (done) return;
    const reduced = isMotionReduced();
    const clear: (() => void)[] = [];

    if (reduced) {
      if (counterRef.current) counterRef.current.textContent = "100%";
      if (barFillRef.current) barFillRef.current.style.transform = "scaleX(1)";
      if (wipeRef.current) wipeRef.current.style.transform = "scaleX(0)";
      if (subRef.current) subRef.current.style.opacity = "1";
      if (infoRef.current) infoRef.current.style.opacity = "1";
      if (cornersRef.current) cornersRef.current.style.opacity = "1";
      const t = window.setTimeout(() => setDone(true), 400);
      return () => window.clearTimeout(t);
    }

    const FILL_MS = 1100;

    // Corner marks fade in immediately
    if (cornersRef.current) {
      animate(cornersRef.current, {
        opacity: [0, 1],
        duration: 400,
        ease: MOTION.ease,
      });
    }

    // Progress bar fills left → right
    if (barFillRef.current) {
      animate(barFillRef.current, {
        scaleX: [0, 1],
        duration: FILL_MS,
        ease: "linear",
      });
    }

    // Count-up 0 → 100 via rAF (mirrors bar)
    const t0 = performance.now();
    let raf: number;
    const countUp = (now: number) => {
      const p = Math.min((now - t0) / FILL_MS, 1);
      if (counterRef.current) counterRef.current.textContent = `${Math.floor(p * 100)}%`;
      if (p < 1) raf = requestAnimationFrame(countUp);
    };
    raf = requestAnimationFrame(countUp);
    clear.push(() => cancelAnimationFrame(raf));

    // Title wipe: overlay scales from 1→0, origin right, reveals left→right
    if (wipeRef.current) {
      animate(wipeRef.current, {
        scaleX: [1, 0],
        duration: 320,
        delay: FILL_MS + 60,
        ease: "outCubic",
      });
    }

    // Subtitle
    if (subRef.current) {
      animate(subRef.current, {
        opacity: [0, 1],
        translateY: [6, 0],
        duration: 280,
        delay: FILL_MS + 320,
        ease: MOTION.ease,
      });
    }

    // Version info
    if (infoRef.current) {
      animate(infoRef.current, {
        opacity: [0, 1],
        duration: 300,
        delay: FILL_MS + 420,
        ease: MOTION.ease,
      });
    }

    // Hold then fade out
    const hold = FILL_MS + 1600;
    const exitId = window.setTimeout(() => {
      if (!rootRef.current) { setDone(true); return; }
      animate(rootRef.current, {
        opacity: [1, 0],
        duration: 500,
        ease: MOTION.easeInOut,
        onComplete: () => setDone(true),
      });
    }, hold);
    clear.push(() => window.clearTimeout(exitId));

    return () => clear.forEach(fn => fn());
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
      {/* HUD corner marks */}
      <div ref={cornersRef} aria-hidden style={{ opacity: 0 }}>
        <Corner pos="tl" />
        <Corner pos="tr" />
        <Corner pos="bl" />
        <Corner pos="br" />
      </div>

      {/* Center content */}
      <div className="relative w-full max-w-lg px-10">

        {/* Title with horizontal wipe reveal */}
        <div className="relative overflow-hidden">
          <h1 className="font-display text-[3.5rem] font-semibold tracking-tight text-aqua-text sm:text-[5rem] leading-none">
            AquaSense
          </h1>
          {/* Wipe overlay — same color as bg, collapses right→left, revealing text */}
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

        {/* Sub-label */}
        <p
          ref={subRef}
          className="mt-2 text-[11px] uppercase tracking-[0.22em] text-aqua-text-muted"
          style={{ opacity: 0 }}
        >
          IoT · Pool Monitor
        </p>

        {/* Progress line + counter */}
        <div className="mt-10">
          {/* Bar track */}
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

          {/* Counter + meta */}
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

// Minimal L-shaped corner marks
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
