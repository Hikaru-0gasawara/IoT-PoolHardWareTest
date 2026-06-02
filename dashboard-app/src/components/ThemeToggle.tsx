import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";

// Botão único do header. Próxima ação no label (não o estado atual) —
// "Mudar para light" lê melhor que "Tema dark ativo".
export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const next = theme === "dark" ? "claro" : "escuro";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Mudar para tema ${next}`}
      title={`Mudar para tema ${next}`}
      className="rounded-lg border border-aqua-border bg-aqua-surface p-2 text-aqua-text-muted transition-colors hover:text-aqua-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aqua-accent"
    >
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
