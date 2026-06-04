import { useEffect, useRef, useState } from "react";
import { animate, createTimeline, stagger, MOTION } from "@/lib/motion";
import { isMotionReduced } from "@/hooks/useReducedMotion";
import { KineticBackground } from "@/components/KineticBackground";

const SS_KEY = "aquasense.intro-seen";

// Tela de entrada animada inspirada no aten7.com: fundo cinético de linhas
// finas, tipografia grande com revelação por letra e saída em fade/scale.
// Aparece uma vez por sessão (sessionStorage) e respeita "reduzir movimento".
export function IntroScreen() {
  const [done, setDone] = useState(true);
  const rootRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const subRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
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
      // ignore
    }
  }, []);

  useEffect(() => {
    if (done) return;
    const reduced = isMotionReduced();

    const letters = titleRef.current?.querySelectorAll<HTMLElement>("[data-letter]");
    if (letters && letters.length) {
      const tl = createTimeline({ defaults: { ease: MOTION.easeInOut } });
      tl.add(letters, {
        opacity: [0, 1],
        translateY: [28, 0],
        duration: MOTION.duration.base,
        delay: reduced ? 0 : stagger(55, { start: 120 }),
      });
      if (subRef.current) {
        tl.add(subRef.current, {
          opacity: [0, 1],
          translateY: [12, 0],
          duration: MOTION.duration.base,
          ease: MOTION.ease,
        }, reduced ? 0 : "+=80");
      }
    } else if (subRef.current) {
      animate(subRef.current, {
        opacity: [0, 1],
        translateY: [12, 0],
        duration: MOTION.duration.base,
        ease: MOTION.ease,
      });
    }

    const hold = reduced ? 350 : 2200;
    const t = window.setTimeout(() => {
      if (!rootRef.current || reduced) {
        setDone(true);
        return;
      }
      animate(rootRef.current, {
        opacity: [1, 0],
        duration: MOTION.duration.route,
        ease: MOTION.easeInOut,
        onComplete: () => setDone(true),
      });
    }, hold);

    return () => window.clearTimeout(t);
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
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, transparent 0%, color-mix(in oklab, var(--aqua-bg) 70%, transparent) 70%, var(--aqua-bg) 100%)",
        }}
        aria-hidden
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
