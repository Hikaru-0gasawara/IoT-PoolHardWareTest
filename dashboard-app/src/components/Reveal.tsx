import { useInView } from "@/hooks/useInView";
import { cn } from "@/lib/utils";

interface RevealProps {
  children: React.ReactNode;
  className?: string;
  /** Stagger offset in ms applied as a CSS transition-delay. */
  delay?: number;
  /** Visibility fraction needed to trigger (forwarded to the observer). */
  threshold?: number;
}

// Scroll-reveal wrapper: the element fades + lifts in the first time it scrolls
// into view. The actual transition lives in CSS (.reveal / .is-visible) so it's
// GPU-friendly and disabled under prefers-reduced-motion without any JS branch.
export function Reveal({ children, className, delay = 0, threshold }: RevealProps) {
  const [ref, inView] = useInView<HTMLDivElement>({ threshold });
  return (
    <div
      ref={ref}
      className={cn("reveal", inView && "is-visible", className)}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}
