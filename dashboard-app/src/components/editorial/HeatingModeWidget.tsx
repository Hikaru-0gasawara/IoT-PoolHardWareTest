import { Bot, Hand } from "lucide-react";
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

      {modo === "parado" && (
        <div className="mb-3 rounded-lg border border-status-warn/40 bg-status-warn/5 px-3 py-2 text-xs text-status-warn">
          Bomba parada — selecione um modo abaixo para reativar.
        </div>
      )}

      <div
        role="radiogroup"
        aria-label="Modo da bomba de aquecimento"
        className="flex gap-1 rounded-full border border-aqua-border bg-aqua-bg/60 p-1.5"
      >
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
        <div className="rounded-2xl border border-aqua-accent/15 bg-aqua-accent/5 p-4">
          <p className="text-[11px] leading-relaxed text-aqua-text-muted">
            {activeMode?.desc ?? "Bomba pausada — sem circulação. Selecione Automático ou Manual."}
          </p>
        </div>
      </div>
    </article>
  );
}
