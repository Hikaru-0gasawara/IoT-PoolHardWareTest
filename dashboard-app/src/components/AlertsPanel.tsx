import { useMemo, useState } from "react";
import { useEffect, useRef } from "react";
import { animate, MOTION } from "@/lib/motion";
import { AlertCircle, AlertTriangle, Check, CheckCircle2, Inbox, ShieldCheck } from "lucide-react";
import { usePoolStore } from "@/store/poolStore";
import { useNow } from "@/hooks/useNow";
import { useAlerts, useConnection } from "@/hooks/useAquaSense";
import { THRESHOLDS } from "@/lib/thresholds";
import { cn } from "@/lib/utils";
import type { AggregatedAlert } from "@/types/aquasense";
import { usePersistentState } from "@/hooks/usePersistentState";

function relativeTime(t: number, now: number): string {
  const s = Math.max(0, Math.floor((now - t) / 1000));
  if (s < 60) return `há ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h}h`;
  return `há ${Math.floor(h / 24)} dias`;
}

function durationLabel(ms: number): string {
  const s = Math.max(1, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  return `${h}h`;
}

const SEV_COLOR = { warn: "var(--status-warn)", crit: "var(--status-crit)" } as const;

type AlertFilter = "ativo" | "reconhecido" | "resolvido";
const ALERT_FILTER_STORAGE_KEY = "aquasense.alerts.filter";
const isAlertFilter = (v: unknown): v is AlertFilter =>
  v === "ativo" || v === "reconhecido" || v === "resolvido";

function classifyForFilter(a: AggregatedAlert): AlertFilter {
  if (a.status === "resolvido") return "resolvido";
  if (a.ack_em != null) return "reconhecido";
  return "ativo";
}

// Mensagens de estado vazio específicas por filtro — antes mostrávamos
// "Nenhum alerta neste filtro." genérico, que parece dashboard quebrado.
// Cada estado feliz tem semântica própria (boa notícia vs nada-a-mostrar).
const EMPTY_STATES: Record<
  AlertFilter,
  { Icon: typeof ShieldCheck; title: string; sub: string; tone: "ok" | "muted" }
> = {
  ativo: {
    Icon: ShieldCheck,
    title: "Nenhum alerta no momento.",
    sub: "A piscina está dentro das faixas ideais.",
    tone: "ok",
  },
  reconhecido: {
    Icon: Inbox,
    title: "Nenhum alerta reconhecido.",
    sub: "Alertas marcados como reconhecidos aparecem aqui até serem resolvidos.",
    tone: "muted",
  },
  resolvido: {
    Icon: CheckCircle2,
    title: "Nenhum alerta resolvido ainda.",
    sub: "O histórico de resoluções aparece aqui após 5 ciclos consecutivos dentro da faixa.",
    tone: "muted",
  },
};

export function AlertsPanel() {
  const alertsRaw = usePoolStore((s) => s.alerts);
  const ack = usePoolStore((s) => s.acknowledgeAlert);
  const liveAlerts = useAlerts();
  const conn = useConnection();
  const now = useNow(2000);
  const [filter, setFilter] = usePersistentState<AlertFilter>(
    ALERT_FILTER_STORAGE_KEY,
    "ativo",
    isAlertFilter,
  );

  // esconde shadows internos
  const alerts = useMemo(
    () => alertsRaw.filter((a) => !a.id.startsWith("shadow:")),
    [alertsRaw],
  );

  const counts = useMemo(() => {
    const c = { ativo: 0, reconhecido: 0, resolvido: 0 } as Record<AlertFilter, number>;
    alerts.forEach((a) => { c[classifyForFilter(a)]++; });
    return c;
  }, [alerts]);

  const filtered = useMemo(
    () => alerts.filter((a) => classifyForFilter(a) === filter),
    [alerts, filter],
  );

  return (
    <div className="space-y-4">
      {/* Live: visão raw do firmware no ciclo atual */}
      <div className="rounded-2xl border border-aqua-border bg-aqua-surface p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-aqua-text-muted">
            Reportado pelo ESP32 agora
          </h3>
          <span className="font-tabular text-[10px] text-aqua-text-muted">
            Fonte: {conn.source === "mqtt" ? `MQTT · ciclo #${conn.cycle ?? "—"}` : conn.source === "fallback" ? "simulação local" : "—"}
          </span>
        </div>
        {liveAlerts.length === 0 ? (
          <div className="flex items-center gap-3 rounded-xl border border-status-ok/40 bg-status-ok/10 p-3 text-sm font-medium text-status-ok">
            <ShieldCheck className="h-5 w-5" /> Todos os parâmetros OK
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {liveAlerts.map((msg, i) => (
              <li key={`${i}-${msg}`} className="flex items-center gap-2 rounded-xl border border-status-crit/40 bg-status-crit/10 p-3 text-sm font-medium text-status-crit">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span className="truncate">{msg}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-2xl border border-aqua-border bg-aqua-surface p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-aqua-text">Alertas agregados</h3>
            <p className="text-xs text-aqua-text-muted">
              Abre após 3 ciclos fora da faixa (≈15s) e resolve após 5 ciclos dentro (≈25s).
            </p>
          </div>
          <div className="flex flex-wrap gap-1" role="tablist" aria-label="Filtrar alertas">
            {(["ativo", "reconhecido", "resolvido"] as const).map((f) => {
              const label = f === "ativo" ? "Ativo" : f === "reconhecido" ? "Reconhecido" : "Resolvido";
              return (
                <button
                  key={f}
                  role="tab"
                  aria-selected={filter === f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    "rounded-lg px-3 py-1 text-xs font-medium transition-colors",
                    filter === f
                      ? "bg-aqua-accent/20 text-aqua-accent"
                      : "text-aqua-text-muted hover:text-aqua-text",
                  )}
                >
                  {label} <span className="font-tabular opacity-70">({counts[f]})</span>
                </button>
              );
            })}
          </div>
        </div>

        <ul className="space-y-2">
          {filtered.map((a) => (
            <AlertRow key={a.id} alert={a} now={now} onAck={() => ack(a.id)} />
          ))}
          {filtered.length === 0 && <EmptyState filter={filter} />}
        </ul>
      </div>
    </div>
  );
}

function EmptyState({ filter }: { filter: AlertFilter }) {
  const { Icon, title, sub, tone } = EMPTY_STATES[filter];
  const isOk = tone === "ok";
  return (
    <li
      className="rounded-xl border border-dashed p-8 text-center"
      style={{
        borderColor: isOk ? "color-mix(in oklab, var(--status-ok) 40%, transparent)" : "var(--aqua-border)",
        backgroundColor: isOk ? "color-mix(in oklab, var(--status-ok) 6%, transparent)" : "transparent",
      }}
    >
      <Icon
        className="mx-auto mb-2 h-8 w-8"
        style={{ color: isOk ? "var(--status-ok)" : "var(--aqua-text-muted)" }}
        aria-hidden="true"
      />
      <p
        className="text-sm font-medium"
        style={{ color: isOk ? "var(--status-ok)" : "var(--aqua-text)" }}
      >
        {title}
      </p>
      <p className="mt-1 text-xs text-aqua-text-muted">{sub}</p>
    </li>
  );
}

function AlertRow({ alert, now, onAck }: { alert: AggregatedAlert; now: number; onAck: () => void }) {
  const isResolved = alert.status === "resolvido";
  const isAcked = alert.ack_em != null && !isResolved;
  const sev = isResolved ? alert.severity_max : alert.severity;
  const color = SEV_COLOR[sev];
  const t = THRESHOLDS[alert.parametro];
  const Icon = sev === "crit" ? AlertCircle : AlertTriangle;

  // Pico semanticamente relevante: o que está mais longe da faixa ideal
  const distMin = Math.abs(alert.valor_min - alert.faixa_ideal.min);
  const distMax = Math.abs(alert.valor_max - alert.faixa_ideal.max);
  const pico = distMax >= distMin ? alert.valor_max : alert.valor_min;
  const picoLabel = `${pico.toFixed(2)}${alert.unidade ? " " + alert.unidade : ""}`;

  const since = isResolved && alert.resolvido_em ? alert.resolvido_em : alert.iniciado_em;
  const duration = (alert.resolvido_em ?? now) - alert.iniciado_em;

  const liRef = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (!liRef.current) return;
    animate(liRef.current, {
      opacity: [0, 1],
      translateX: [-8, 0],
      duration: MOTION.duration.base,
      ease: MOTION.ease,
    });
  }, []);

  return (
    <li
      ref={liRef}
      className={cn(
        "flex items-start gap-3 rounded-xl border p-3 transition-opacity",
        isResolved && "opacity-60",
        isAcked && "opacity-70",
      )}
      style={{
        borderColor: isResolved ? "var(--aqua-border)" : color,
        backgroundColor: isResolved
          ? "color-mix(in oklab, var(--aqua-bg) 50%, transparent)"
          : `color-mix(in oklab, ${color} 8%, transparent)`,
      }}
    >
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
        style={{
          backgroundColor: `color-mix(in oklab, ${color} 18%, transparent)`,
          color,
        }}
        aria-hidden
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-sm font-semibold text-aqua-text">
            {t.label}{" "}
            <span className="font-tabular">
              {alert.valor_atual.toFixed(2)}{alert.unidade ? " " + alert.unidade : ""}
            </span>
          </span>
          <span
            className="rounded-full border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide"
            style={{ borderColor: color, color }}
          >
            {sev === "crit" ? "Crítico" : "Atenção"}
          </span>
          <span className="font-tabular text-[10px] text-aqua-text-muted">
            {isResolved ? `resolvido ${relativeTime(since, now)}` : `iniciado ${relativeTime(since, now)}`}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-aqua-text-muted">
          Faixa ideal{" "}
          <span className="font-tabular">
            {alert.faixa_ideal.min}–{alert.faixa_ideal.max}
            {alert.unidade ? " " + alert.unidade : ""}
          </span>
          {" · pico "}
          <span className="font-tabular">{picoLabel}</span>
        </p>
        <p className="mt-0.5 font-tabular text-[11px] text-aqua-text-muted">
          {alert.ocorrencias} {alert.ocorrencias === 1 ? "ocorrência" : "ocorrências"} em {durationLabel(duration)}
          {isResolved && alert.severity_max === "crit" && alert.severity !== alert.severity_max && (
            <span className="ml-2 text-status-crit">· chegou a CRÍTICO</span>
          )}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        {isResolved ? (
          <span className="rounded-full border border-aqua-border px-2 py-0.5 text-[10px] uppercase tracking-wide text-aqua-text-muted">
            Resolvido
          </span>
        ) : isAcked ? (
          <span className="rounded-full border border-aqua-border px-2 py-0.5 text-[10px] uppercase tracking-wide text-aqua-text-muted">
            Reconhecido
          </span>
        ) : (
          <button
            onClick={onAck}
            className="inline-flex items-center gap-1 rounded-lg border border-aqua-border px-2 py-1 text-[10px] text-aqua-text-muted hover:text-aqua-text"
            aria-label={`Reconhecer alerta ${t.label}`}
          >
            <Check className="h-3 w-3" /> Reconhecer
          </button>
        )}
      </div>
    </li>
  );
}
