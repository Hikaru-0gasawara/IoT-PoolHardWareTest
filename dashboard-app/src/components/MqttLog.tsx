import { useState } from "react";
import { ChevronDown, ChevronRight, Radio } from "lucide-react";
import { useMqtt } from "@/providers/MqttProvider";
import { cn } from "@/lib/utils";
import { MQTT_TOPICS } from "@/lib/mqttTopics";

function summarize(payload: string): string {
  if (payload.length <= 90) return payload;
  return payload.slice(0, 87) + "…";
}

function fmtTime(t: number): string {
  return new Date(t).toLocaleTimeString("pt-BR", { hour12: false });
}

export function MqttLog() {
  const { log, status, source } = useMqtt();
  const [open, setOpen] = useState(false);

  return (
    <section className="rounded-2xl border border-aqua-border bg-aqua-surface">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2">
          {open ? <ChevronDown className="h-4 w-4 text-aqua-text-muted" /> : <ChevronRight className="h-4 w-4 text-aqua-text-muted" />}
          <Radio className={cn("h-4 w-4", status === "connected" ? "text-status-ok" : "text-status-crit")} />
          <h3 className="text-sm font-semibold text-aqua-text">Log MQTT</h3>
          <span className="text-[10px] uppercase tracking-wider text-aqua-text-muted">
            {log.length}/50 mensagens · {source}
          </span>
        </div>
        <span className="text-[10px] text-aqua-text-muted">{MQTT_TOPICS.ALL}</span>
      </button>

      {open && (
        <div className="max-h-80 overflow-y-auto border-t border-aqua-border bg-aqua-bg/40 px-3 py-2 font-mono text-[11px] leading-relaxed">
          {log.length === 0 ? (
            <div className="py-6 text-center text-aqua-text-muted">Aguardando mensagens do broker…</div>
          ) : (
            <ul className="space-y-1">
              {log.map((m, i) => (
                <li key={`${m.t}-${i}`} className="flex gap-2">
                  <span className="shrink-0 text-aqua-text-muted">[{fmtTime(m.t)}]</span>
                  <span className="shrink-0 font-semibold text-aqua-accent">{m.topic}</span>
                  <span className="text-aqua-text-muted">→</span>
                  <span className="truncate text-aqua-text">{summarize(m.payload)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}