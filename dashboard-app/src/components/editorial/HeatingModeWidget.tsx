import { Bot, Hand, Ban } from "lucide-react";
import { usePoolStore } from "@/store/poolStore";
import { usePublishControlMode, useConnection } from "@/hooks/useAquaSense";

const MODES = [
  { key: "automatico" as const, label: "Automático", desc: "ESP32 decide via histerese ΔT 5°C / 1°C.", icon: <Bot className="h-4 w-4" /> },
  { key: "manual" as const, label: "Manual", desc: "Operador liga/desliga a bomba diretamente.", icon: <Hand className="h-4 w-4" /> },
];

export function HeatingModeWidget() {
  const publishControlMode = usePublishControlMode();
  const conn = useConnection();
  const modo = usePoolStore((s) => s.bomba_modo);
  const setMode = usePoolStore((s) => s.setMode);
  const hasLiveFirmware = conn.status === "connected" && conn.source === "mqtt";

  const isParado = modo === "parado";
  const activeMode = MODES.find((m) => m.key === modo);

  return (
    <article className="w-full rounded-3xl border border-aqua-border bg-aqua-surface p-6 shadow-aqua flex flex-col">
      <header className="mb-5 flex items-start justify-between gap-2">
        <div>
          <h3 className="font-display text-lg font-semibold text-aqua-text">Modo da bomba</h3>
          <p className="text-xs text-aqua-text-muted mt-1">Aquecimento solar · independente da dosagem.</p>
        </div>
        <span
          aria-hidden={hasLiveFirmware}
          className={[
            "shrink-0 inline-flex items-center gap-1 rounded-full border border-aqua-border px-2 py-1 text-[10px] font-medium text-aqua-text-muted transition-opacity duration-300",
            hasLiveFirmware ? "opacity-0 pointer-events-none" : "opacity-100",
          ].join(" ")}
        >
          ○ sem dados
        </span>
      </header>

      {/* Toggle group — when parado, shows the current state as a disabled chip
          plus the two options to switch to, making all three states readable. */}
      <div
        role="radiogroup"
        aria-label="Modo da bomba de aquecimento"
        className="flex gap-1 rounded-full border border-aqua-border bg-aqua-bg/60 p-1.5"
      >
        {/* "Parado" state chip — only visible when pump is stopped.
            Not a button: the user must go to Controle Avançado to select this.
            Purpose: make the current state legible alongside the two options. */}
        {isParado && (
          <div
            role="radio"
            aria-checked
            aria-label="Parado (definido no Controle Avançado)"
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-bold border border-status-warn/50 bg-status-warn/10 text-status-warn select-none"
          >
            <Ban className="h-3.5 w-3.5" aria-hidden />
            Parado
          </div>
        )}

        {MODES.map((m) => {
          const active = modo === m.key;
          return (
            <button
              key={m.key}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => {
                setMode(m.key);
                void publishControlMode(m.key).catch(() => undefined);
              }}
              className={[
                "flex-1 inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-bold transition-all",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aqua-accent/40",
                active
                  ? "bg-aqua-accent text-aqua-bg shadow-glow-accent"
                  : "text-aqua-text-muted hover:text-aqua-text",
              ].join(" ")}
            >
              <span aria-hidden>{m.icon}</span>
              {m.label}
            </button>
          );
        })}
      </div>

      <div className="mt-auto pt-5">
        <div className={[
          "rounded-2xl border p-4 transition-colors",
          isParado
            ? "border-status-warn/20 bg-status-warn/5"
            : "border-aqua-accent/15 bg-aqua-accent/5",
        ].join(" ")}>
          <p className="text-[11px] leading-relaxed text-aqua-text-muted">
            {isParado
              ? "Bomba pausada — clique em Automático ou Manual para retomar a circulação."
              : (activeMode?.desc ?? "Selecione um modo acima.")}
          </p>
        </div>
      </div>
    </article>
  );
}
