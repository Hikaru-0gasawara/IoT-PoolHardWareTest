// HoldButton — botão visual hold-to-confirm com barra de progresso.
//
// Usado para comandos críticos (dose manual de cloro/ácido/base). Combina
// useHoldToConfirm com feedback visual: barra preenche da esquerda para a
// direita conforme usuário segura, completa em 1.5s, dispara ação.
//
// Visual:
//   - estado normal: borda + cor do tema
//   - segurando: barra de progresso interna preenche
//   - disabled: opacity-50, cursor-not-allowed, tooltip explica motivo
//   - completo: pisca momentaneamente em verde antes de resetar (handled via key)

import { useHoldToConfirm } from "@/hooks/useHoldToConfirm";
import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";

type Tone = "danger" | "warn" | "primary";

export interface HoldButtonProps {
  onConfirm: () => void | Promise<void>;
  disabled?: boolean;
  /** Texto/tooltip mostrado quando disabled (motivo do bloqueio) */
  disabledReason?: string;
  /** Tom de cor — danger=cloro, warn=ácido/base, primary=neutro */
  tone?: Tone;
  durationMs?: number;
  loading?: boolean;
  children: ReactNode;
  icon?: ReactNode;
  /** Sublabel mostrada abaixo do label principal */
  subtitle?: string;
}

const TONE_CLASSES: Record<Tone, { border: string; text: string; fill: string; iconBg: string }> = {
  danger: {
    border: "border-status-crit/40 hover:border-status-crit/70",
    text: "text-status-crit",
    fill: "bg-status-crit/25",
    iconBg: "bg-status-crit/15",
  },
  warn: {
    border: "border-status-warn/40 hover:border-status-warn/70",
    text: "text-status-warn",
    fill: "bg-status-warn/25",
    iconBg: "bg-status-warn/15",
  },
  primary: {
    border: "border-aqua-accent/40 hover:border-aqua-accent/70",
    text: "text-aqua-accent",
    fill: "bg-aqua-accent/25",
    iconBg: "bg-aqua-accent/15",
  },
};

export function HoldButton({
  onConfirm,
  disabled = false,
  disabledReason,
  tone = "primary",
  durationMs = 1500,
  loading = false,
  children,
  icon,
  subtitle,
}: HoldButtonProps) {
  const effectiveDisabled = disabled || loading;
  const { progress, isHolding, handlers } = useHoldToConfirm({
    durationMs,
    onConfirm,
    disabled: effectiveDisabled,
  });

  const cls = TONE_CLASSES[tone];
  const pct = Math.round(progress * 100);

  return (
    <button
      type="button"
      disabled={effectiveDisabled}
      title={effectiveDisabled ? disabledReason : `Segure por ${(durationMs / 1000).toFixed(1)}s para confirmar`}
      aria-label={typeof children === "string" ? children : undefined}
      aria-disabled={effectiveDisabled}
      {...handlers}
      className={[
        "relative w-full overflow-hidden rounded-xl border bg-aqua-surface-2/50 px-3.5 py-3 text-left transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aqua-accent/40",
        effectiveDisabled
          ? "cursor-not-allowed border-aqua-border opacity-50"
          : `cursor-pointer ${cls.border}`,
        isHolding ? "scale-[0.99]" : "",
      ].join(" ")}
    >
      {/* Barra de progresso — fica atrás do conteúdo */}
      <span
        aria-hidden
        className={`absolute inset-y-0 left-0 transition-[width] duration-75 ${cls.fill}`}
        style={{ width: `${pct}%` }}
      />
      {/* Conteúdo acima da barra */}
      <span className="relative flex items-center gap-3">
        <span
          className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${cls.iconBg} ${cls.text}`}
          aria-hidden
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
        </span>
        <span className="flex-1 min-w-0">
          <span className={`block text-sm font-semibold ${cls.text}`}>{children}</span>
          {subtitle && (
            <span className="block text-[11px] leading-tight text-aqua-text-muted">{subtitle}</span>
          )}
        </span>
        {isHolding && (
          <span className="font-tabular text-[10px] font-medium uppercase tracking-wider text-aqua-text-muted">
            {pct}%
          </span>
        )}
      </span>
    </button>
  );
}
