import { Sun, Moon, MoonStar } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { key: "dark"       as const, icon: Moon,     label: "Escuro azul"  },
  { key: "dark-black" as const, icon: MoonStar,  label: "Escuro preto" },
  { key: "light"      as const, icon: Sun,       label: "Claro"        },
];

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <div
      role="group"
      aria-label="Tema"
      className="flex rounded-lg border border-aqua-border bg-aqua-bg/60 p-0.5"
    >
      {OPTIONS.map(({ key, icon: Icon, label }) => (
        <button
          key={key}
          type="button"
          onClick={() => setTheme(key)}
          aria-label={label}
          title={label}
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-md transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aqua-accent",
            theme === key
              ? "bg-aqua-surface text-aqua-text shadow-sm"
              : "text-aqua-text-muted hover:text-aqua-text",
          )}
        >
          <Icon className="h-3.5 w-3.5" />
        </button>
      ))}
    </div>
  );
}
