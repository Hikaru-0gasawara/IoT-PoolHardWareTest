import { useEffect, useRef, useState } from "react";

interface UseInViewOptions {
  /** 0–1 fraction of the element that must be visible to trigger. */
  threshold?: number;
  /** Margin around the root; negative bottom delays the trigger slightly. */
  rootMargin?: string;
  /** Fire only once then stop observing (default). When false, toggles. */
  once?: boolean;
}

// Lightweight IntersectionObserver hook for scroll-reveal. SSR-safe: renders
// hidden on the server and reveals on the client once the element scrolls into
// view. If IntersectionObserver is unavailable, content is shown immediately so
// nothing is ever permanently hidden.
export function useInView<T extends HTMLElement = HTMLDivElement>(
  opts: UseInViewOptions = {},
): [React.RefObject<T | null>, boolean] {
  const { threshold = 0.15, rootMargin = "0px 0px -8% 0px", once = true } = opts;
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }

    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setInView(true);
            if (once) obs.unobserve(entry.target);
          } else if (!once) {
            setInView(false);
          }
        }
      },
      { threshold, rootMargin },
    );

    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold, rootMargin, once]);

  return [ref, inView];
}
