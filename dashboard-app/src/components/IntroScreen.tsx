import { useEffect, useRef, useState } from "react";
import { animate, MOTION } from "@/lib/motion";
import { isMotionReduced } from "@/hooks/useReducedMotion";
import { KineticBackground } from "@/components/KineticBackground";

const SS_KEY = "aquasense.intro-seen";
const SCRAMBLE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#@!&%";

export function IntroScreen() {
  const [done, setDone] = useState(true);
  const rootRef = useRef<HTMLDivElement>(null);
  const scanRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const subRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    let seen = true;
    try {
      seen = sessionStorage.getItem(SS_KEY) === "1";
    } catch {
      seen = false;
    }
    if (seen) { setDone(true); return; }
    setDone(false);
    try { sessionStorage.setItem(SS_KEY, "1"); } catch {}
  }, []);

  useEffect(() => {
    if (done) return;
    const reduced = isMotionReduced();
    const clearFns: (() => void)[] = [];

    const letters = titleRef.current?.querySelectorAll<HTMLElement>("[data-letter]");

    if (reduced) {
      // No motion: snap everything visible immediately
      letters?.forEach(el => {
        el.textContent = el.getAttribute("data-char") ?? el.textContent;
        el.style.opacity = "1";
      });
      if (subRef.current) subRef.current.style.opacity = "1";
    } else {
      // 1. Scan line sweeps top → bottom (aten7-style scanner)
      if (scanRef.current) {
        animate(scanRef.current, {
          translateY: ["0px", "100vh"],
          opacity: [0, 1],
          duration: 560,
          ease: "inSine",
        });
      }

      // 2. Letter scramble-decode reveal (characters resolve after scan passes)
      letters?.forEach((el, i) => {
        const target = el.getAttribute("data-char") ?? "";
        const delay = 380 + i * 68; // starts after scan line passes center

        animate(el, {
          opacity: [0, 1],
          translateY: [16, 0],
          duration: 320,
          delay,
          ease: MOTION.easeInOut,
          onComplete: () => { el.textContent = target; },
        });

        // Scramble random chars during the fade-in window
        const scrambleId = window.setInterval(() => {
          if (parseFloat(el.style.opacity || "0") > 0.05) {
            el.textContent = SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
          }
        }, 38);
        clearFns.push(() => window.clearInterval(scrambleId));

        // Resolve to correct char at ~70% of animation
        const resolveId = window.setTimeout(() => {
          window.clearInterval(scrambleId);
          el.textContent = target;
        }, delay + 224); // 70% of 320ms
        clearFns.push(() => window.clearTimeout(resolveId));
      });

      // 3. Subtitle fades in after letters finish
      const letterCount = letters?.length ?? 9;
      if (subRef.current) {
        animate(subRef.current, {
          opacity: [0, 1],
          translateY: [10, 0],
          duration: MOTION.duration.base,
          delay: 380 + letterCount * 68 + 120,
          ease: MOTION.ease,
        });
      }
    }

    const hold = reduced ? 350 : 2400;
    const exitId = window.setTimeout(() => {
      if (!rootRef.current || reduced) { setDone(true); return; }
      animate(rootRef.current, {
        opacity: [1, 0],
        duration: MOTION.duration.route,
        ease: MOTION.easeInOut,
        onComplete: () => setDone(true),
      });
    }, hold);
    clearFns.push(() => window.clearTimeout(exitId));

    return () => clearFns.forEach(fn => fn());
  }, [done]);

  if (done) return null;

  const title = "AquaSense";

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden bg-aqua-bg"
      role="presentation"
    >
      <KineticBackground density={1.8} opacity={0.7} />
      {/* Radial vignette */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, transparent 0%, color-mix(in oklab, var(--aqua-bg) 70%, transparent) 70%, var(--aqua-bg) 100%)",
        }}
      />
      {/* Horizontal scan line — sweeps top to bottom */}
      <div
        ref={scanRef}
        aria-hidden
        className="pointer-events-none absolute left-0 right-0"
        style={{
          top: 0,
          height: "1px",
          opacity: 0,
          willChange: "transform, opacity",
          background:
            "linear-gradient(90deg, transparent 0%, oklch(0.80 0.15 152 / 0.5) 15%, oklch(0.97 0.004 160 / 0.92) 50%, oklch(0.80 0.15 152 / 0.5) 85%, transparent 100%)",
          boxShadow: "0 0 10px 3px oklch(0.80 0.15 152 / 0.45)",
        }}
      />
      <div className="relative flex flex-col items-center px-6 text-center">
        <h1
          ref={titleRef}
          className="font-display text-6xl font-semibold tracking-tight text-aqua-text sm:text-8xl"
          aria-label={title}
        >
          {title.split("").map((c, i) => (
            <span
              key={i}
              data-letter
              data-char={c}
              className="inline-block"
              style={{ opacity: 0, willChange: "transform, opacity" }}
            >
              {c}
            </span>
          ))}
        </h1>
        <p
          ref={subRef}
          className="text-label mt-5"
          style={{ opacity: 0 }}
        >
          IoT · Pool Monitor
        </p>
      </div>
    </div>
  );
}
