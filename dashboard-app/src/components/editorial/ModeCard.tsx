import type { ControlMode } from "@/types/firmware";

// Card "Modo de operação" — apenas leitura nesta rodada (controle real fica
// na rota /controle). Mostra o modo do firmware com tipografia display.

interface Props {
  mode: ControlMode | null;
  estopActive: boolean;
  loading: boolean;
}

function label(mode: ControlMode | null, estopActive: boolean): string {
  if (estopActive) return "Emergência";
  if (mode === "auto") return "Automático";
  if (mode === "manual") return "Manual";
  return "—";
}

function description(mode: ControlMode | null, estopActive: boolean): string {
  if (estopActive) return "Botão físico acionado. Dosagem e bomba travadas até reset manual.";
  if (mode === "auto") return "Sistema decide dosagens conforme leituras dos sensores.";
  if (mode === "manual") return "Aguardando comando do operador. Sem dosagem automática.";
  return "Aguardando primeiro ciclo do ESP32…";
}

export function ModeCard({ mode, estopActive, loading }: Props) {
  const tone = estopActive ? "var(--status-crit)" : mode === "auto" ? "var(--aqua-accent)" : "var(--aqua-text-muted)";
  return (
    <article
      className="rounded-2xl border bg-aqua-surface p-5"
      style={{ borderColor: estopActive ? "var(--status-crit)" : "var(--aqua-border)" }}
    >
      <div className="text-label">Modo de operação</div>
      <div className="mt-2 text-display-large" style={{ color: tone }}>
        {loading ? "—" : label(mode, estopActive)}
      </div>
      <p className="mt-2 text-sm leading-relaxed text-aqua-text-muted">
        {description(mode, estopActive)}
      </p>
    </article>
  );
}
