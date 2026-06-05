import { Activity, Zap } from "lucide-react";
import { useReducedMotion } from "@/hooks/useReducedMotion";

// Toggle de "reduzir movimento". Cicla por dois estados efetivos a partir da
// preferência atual: liga/desliga as animações anime.js. Quando o usuário
// nunca escolheu ("system"), o ponto de partida segue o SO via prefers-
// reduced-motion — e o primeiro clique inverte esse estado explicitamente.
export function ReduceMotionToggle() {
  const { reduced, setPreference } = useReducedMotion();
  // Próxima ação no label: se está reduzido, o clique reativa; e vice-versa.
  const next = reduced ? "ativar animações" : "reduzir movimento";

  return (
    <button
      type="button"
      onClick={() => setPreference(reduced ? "off" : "on")}
      aria-label={next}
      aria-pressed={reduced}
      title={next}
      data-testid="reduce-motion-toggle"
      className="rounded-lg border border-aqua-border bg-aqua-surface p-2 text-aqua-text-muted transition-colors hover:text-aqua-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aqua-accent"
    >
      {reduced ? <Activity className="h-4 w-4" /> : <Zap className="h-4 w-4" />}
    </button>
  );
}
