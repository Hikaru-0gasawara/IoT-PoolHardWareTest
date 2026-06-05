import { cn } from "@/lib/utils";

interface PageHeadingProps {
  /** Small uppercase kicker above the title (mono, muted). */
  eyebrow?: string;
  title: string;
  subtitle?: string;
  /** Optional right-aligned slot — typically an action button. */
  action?: React.ReactNode;
  className?: string;
}

// Editorial page header shared across routes: a mono eyebrow, an oversized
// display title and an optional subtitle, with an action slot that drops below
// the title on small screens. Unifies the typographic scale so every page opens
// with the same hero rhythm.
export function PageHeading({ eyebrow, title, subtitle, action, className }: PageHeadingProps) {
  return (
    <header
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow && <p className="text-label mb-2.5">{eyebrow}</p>}
        <h1 className="font-display text-4xl font-semibold leading-[0.95] tracking-tight text-aqua-text sm:text-5xl lg:text-6xl">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-aqua-text-muted">
            {subtitle}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}
