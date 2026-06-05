import { useState, useEffect, useRef } from "react";
import {
  FlaskConical,
  Beaker,
  Droplets,
  CheckCircle2,
  Settings2,
  CircleDot,
  Activity,
  Wifi,
  WifiOff,
  TriangleAlert,
  Bot,
  Hand,
  Power,
  Thermometer,
  Sun,
  Waves,
  Gauge,
  Radio,
  Clock,
  Database,
  Minus,
  Plus,
  ChevronDown,
  ChevronRight,
  Ban,
  Cpu,
  ShieldAlert,
} from "lucide-react";
import { animate, MOTION } from "@/lib/motion";
import { useMqtt } from "@/providers/MqttProvider";
import { HoldButton } from "@/components/HoldButton";
import { MqttLog } from "@/components/MqttLog";
import { isSensorError, SENSOR_ERROR_VALUE } from "@/types/firmware";
import { usePoolStore } from "@/store/poolStore";
import { useConnection } from "@/hooks/useAquaSense";
import { useNow } from "@/hooks/useNow";
import { POOL } from "@/lib/constants";
import { cn } from "@/lib/utils";
import {
  COMMAND_TOPIC_MAP,
  TELEMETRY_TOPIC_MAP,
  type TopicMapEntry,
} from "@/lib/mqttTopics";
import { reasonToBlockDose as computeBlockReason } from "@/lib/dosingGuards";
import type { DoseChemical, DosingResponse } from "@/types/firmware";
import type { PumpMode } from "@/types/aquasense";

const CHEMICALS: ReadonlyArray<{
  key: DoseChemical;
  label: string;
  subtitle: string;
  tone: "danger" | "warn";
  icon: React.ReactNode;
  sensorPath: "cloro" | "ph";
}> = [
  {
    key: "cloro",
    label: "Dose de Cloro",
    subtitle: "Bomba peristáltica · GPIO 25",
    tone: "danger",
    icon: <Droplets className="h-4 w-4" />,
    sensorPath: "cloro",
  },
  {
    key: "acido",
    label: "Dose de Ácido (pH−)",
    subtitle: "Bomba peristáltica · GPIO 32",
    tone: "warn",
    icon: <FlaskConical className="h-4 w-4" />,
    sensorPath: "ph",
  },
  {
    key: "base",
    label: "Dose de Base (pH+)",
    subtitle: "Bomba peristáltica · GPIO 14",
    tone: "warn",
    icon: <Beaker className="h-4 w-4" />,
    sensorPath: "ph",
  },
];

export function AdvancedControlPanel() {
  return (
    <div className="space-y-4">
      <LivePanel />
      <OperationPanel />
      <DiagnosticsPanel />
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Painel funcional — dosagem manual + modo dosagem
// ────────────────────────────────────────────────────────────────────

function LivePanel() {
  const {
    status,
    source,
    data,
    dosingResponses,
    publishDosingCommand,
    publishDosingMode,
  } = useMqtt();

  const [feedback, setFeedback] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [pendingDose, setPendingDose] = useState<DoseChemical | null>(null);
  const ultimaDosePorProduto = usePoolStore((s) => s.ultimaDosePorProduto);
  const doseTimestamps = usePoolStore((s) => s.doseTimestamps);
  const modo = usePoolStore((s) => s.dosagem_modo);
  const setDosingMode = usePoolStore((s) => s.setDosingMode);
  const now = useNow(30_000);

  const brokerConnected = status === "connected";
  const hasLiveFirmware = brokerConnected && source === "mqtt";

  const showFeedback = (kind: "ok" | "err", text: string) => {
    setFeedback({ kind, text });
    window.setTimeout(() => setFeedback(null), 3500);
  };

  const handleDose = async (chem: DoseChemical) => {
    setPendingDose(chem);
    try {
      await publishDosingCommand(chem);
      showFeedback("ok", `Comando de dose enviado: ${chem}`);
    } catch (e) {
      showFeedback("err", e instanceof Error ? e.message : "Falha ao publicar comando");
    } finally {
      setPendingDose(null);
    }
  };

  const handleDosingMode = async (m: PumpMode) => {
    setDosingMode(m);
    try {
      await publishDosingMode(m);
      showFeedback("ok", `Modo de dosagem: ${m}`);
    } catch (e) {
      showFeedback("err", e instanceof Error ? e.message : "Falha ao publicar modo");
    }
  };

  const reasonToBlockDose = (chem: DoseChemical): string | null => {
    const meta = CHEMICALS.find((c) => c.key === chem);
    const sensorValue = meta && data
      ? (meta.sensorPath === "ph" ? data.qualidade_agua.ph : data.qualidade_agua.cloro)
      : 0;
    return computeBlockReason({
      chem,
      hasLiveFirmware,
      modo,
      sensorError: isSensorError(sensorValue),
      pendingDose,
      ultimaDosePorProduto,
      doseTimestamps,
      now,
    });
  };

  const formatSince = (t: number | null): string | null => {
    if (t == null) return null;
    const diff = Math.max(0, now - t);
    const s = Math.floor(diff / 1000);
    if (s < 60) return `há ${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `há ${m}min`;
    const h = Math.floor(m / 60);
    return `há ${h}h ${m % 60}min`;
  };

  return (
    <section
      className="rounded-xl border border-aqua-border bg-aqua-surface p-4"
      aria-label="Painel de dosagem"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-aqua-accent/10 text-aqua-accent" aria-hidden>
            <Settings2 className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-aqua-text">Dosagem química</h2>
            <p className="text-[11px] text-aqua-text-muted">Modo de dosagem e comandos manuais via MQTT</p>
          </div>
        </div>
        <ConnectionPill brokerConnected={brokerConnected} hasLiveFirmware={hasLiveFirmware} />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <StatusCard
          label="Bomba"
          value={data?.controle.bomba === "LIGADA" ? "Ligada" : "Desligada"}
          tone={data?.controle.bomba === "LIGADA" ? "ok" : "neutral"}
          icon={<Activity className="h-3.5 w-3.5" />}
        />
        <StatusCard
          label="Alertas"
          value={data ? String(data.alertas.length) : "—"}
          tone={data && data.alertas.length > 0 ? "warn" : "ok"}
          icon={<TriangleAlert className="h-3.5 w-3.5" />}
        />
        <StatusCard
          label="Respostas"
          value={String(dosingResponses.length)}
          tone="neutral"
          icon={<CircleDot className="h-3.5 w-3.5" />}
        />
      </div>

      {feedback && (
        <div
          role="status"
          className={
            "mt-3 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs " +
            (feedback.kind === "ok"
              ? "border-status-ok/40 bg-status-ok/5 text-status-ok"
              : "border-status-crit/40 bg-status-crit/5 text-status-crit")
          }
        >
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Modo de dosagem — 3 opções */}
      <div className="mt-4">
        <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-aqua-text-muted">
          Modo de dosagem
        </h3>
        <div className="grid grid-cols-3 gap-2">
          <ModeButton
            active={modo === "automatico"}
            disabled={!brokerConnected}
            icon={<Bot className="h-4 w-4" />}
            label="Automático"
            sub="Sistema dosa por sensores"
            onClick={() => handleDosingMode("automatico")}
          />
          <ModeButton
            active={modo === "manual"}
            disabled={!brokerConnected}
            icon={<Hand className="h-4 w-4" />}
            label="Manual"
            sub="Só doses do operador"
            onClick={() => handleDosingMode("manual")}
          />
          <ModeButton
            active={modo === "parado"}
            disabled={!brokerConnected}
            icon={<Ban className="h-4 w-4" />}
            label="Parado"
            sub="Sem dosagem alguma"
            onClick={() => handleDosingMode("parado")}
            tone="danger"
          />
        </div>
      </div>

      {/* Botões de dose manual */}
      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-aqua-text-muted">
            Dose manual
          </h3>
          <span className="text-[10px] text-aqua-text-muted">Segure 1.5s para confirmar</span>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {CHEMICALS.map((c) => {
            const reason = reasonToBlockDose(c.key);
            const last = formatSince(ultimaDosePorProduto[c.key]);
            const subtitle = last ? `${c.subtitle} · última ${last}` : c.subtitle;
            return (
              <HoldButton
                key={c.key}
                tone={c.tone}
                icon={c.icon}
                disabled={reason !== null}
                disabledReason={reason ?? undefined}
                loading={pendingDose === c.key}
                onConfirm={() => handleDose(c.key)}
                subtitle={subtitle}
              >
                {c.label}
              </HoldButton>
            );
          })}
        </div>
      </div>

      <div className="mt-4">
        <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-aqua-text-muted">
          Últimas respostas
        </h3>
        <DosingResponseList responses={dosingResponses.slice(0, 6)} />
      </div>
    </section>
  );
}

function ConnectionPill({ brokerConnected, hasLiveFirmware }: { brokerConnected: boolean; hasLiveFirmware: boolean }) {
  const label = hasLiveFirmware ? "ESP32 ao vivo" : brokerConnected ? "Aguardando ESP32" : "MQTT offline";
  const ok = hasLiveFirmware;
  return (
    <span
      className={
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium " +
        (ok
          ? "border-status-ok/40 bg-status-ok/5 text-status-ok"
          : brokerConnected
            ? "border-status-warn/40 bg-status-warn/5 text-status-warn"
            : "border-status-crit/40 bg-status-crit/5 text-status-crit")
      }
    >
      {brokerConnected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
      {label}
    </span>
  );
}

function StatusCard({
  label,
  value,
  tone,
  icon,
  sub,
}: {
  label: string;
  value: string;
  tone: "ok" | "warn" | "crit" | "neutral";
  icon: React.ReactNode;
  sub?: string;
}) {
  const toneClass =
    tone === "ok"
      ? "text-status-ok"
      : tone === "warn"
        ? "text-status-warn"
        : tone === "crit"
          ? "text-status-crit"
          : "text-aqua-text";
  return (
    <div className="rounded-lg border border-aqua-border bg-aqua-surface-2/40 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-aqua-text-muted">
        <span className={toneClass} aria-hidden>{icon}</span>
        {label}
      </div>
      <div className={`mt-0.5 font-tabular text-base font-semibold capitalize ${toneClass}`}>
        {value}
      </div>
      {sub && <div className="text-[10px] text-aqua-text-muted">{sub}</div>}
    </div>
  );
}

function DosingResponseList({ responses }: { responses: ReadonlyArray<DosingResponse> }) {
  if (responses.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-aqua-border bg-aqua-surface-2/30 px-3 py-4 text-center text-xs text-aqua-text-muted">
        Nenhuma resposta de dosagem ainda.
      </div>
    );
  }
  return (
    <ul className="divide-y divide-aqua-border/60 overflow-hidden rounded-lg border border-aqua-border">
      {responses.map((ev, i) => (
        <li key={i} className="flex items-center gap-2.5 bg-aqua-surface-2/30 px-3 py-2">
          <ResultIcon kind={ev.resultado} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 text-xs font-medium text-aqua-text">
              <span className="capitalize">{ev.parametro ?? "—"}</span>
              <span className="text-aqua-text-muted">·</span>
              <ResultBadge kind={ev.resultado} />
            </div>
            {ev.motivo && (
              <div className="truncate text-[11px] text-aqua-text-muted">{ev.motivo}</div>
            )}
          </div>
          <time className="font-tabular text-[10px] text-aqua-text-muted shrink-0">
            {new Date(ev.t).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </time>
        </li>
      ))}
    </ul>
  );
}

function ResultIcon({ kind }: { kind: DosingResponse["resultado"] }) {
  if (kind === "ok")
    return (
      <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-status-ok/15 text-status-ok" aria-hidden>
        <CheckCircle2 className="h-3 w-3" />
      </span>
    );
  if (kind === "bloqueado")
    return (
      <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-status-warn/15 text-status-warn" aria-hidden>
        <CircleDot className="h-3 w-3" />
      </span>
    );
  return (
    <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-status-crit/15 text-status-crit" aria-hidden>
      <TriangleAlert className="h-3 w-3" />
    </span>
  );
}

function ResultBadge({ kind }: { kind: DosingResponse["resultado"] }) {
  const map = {
    ok: { label: "ok", cls: "text-status-ok" },
    erro: { label: "erro", cls: "text-status-crit" },
    bloqueado: { label: "bloqueado", cls: "text-status-warn" },
  } as const;
  const m = map[kind];
  return (
    <span className={`text-[10px] font-semibold uppercase tracking-wider ${m.cls}`}>
      {m.label}
    </span>
  );
}

// ────────────────────────────────────────────────────────────────────
// Painel de operação — bomba de aquecimento solar completa + parada geral
// ────────────────────────────────────────────────────────────────────

function OperationPanel() {
  const { status, publishControlMode, publishDosingMode } = useMqtt();
  const modo = usePoolStore((s) => s.bomba_modo);
  const setMode = usePoolStore((s) => s.setMode);
  const setDosingMode = usePoolStore((s) => s.setDosingMode);
  const bombaOn = usePoolStore((s) => s.bomba_ligada);
  const ultimaMudanca = usePoolStore((s) => s.ultima_mudanca_bomba_t);
  const dt = usePoolStore((s) => s.delta_t);
  const log = usePoolStore((s) => s.pumpLog);
  const setpoint = usePoolStore((s) => s.setpoint_temp);
  const setSetpoint = usePoolStore((s) => s.setSetpoint);
  const now = useNow(1000);
  const dtMarkerRef = useRef<HTMLDivElement>(null);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const brokerConnected = status === "connected";
  const isParado = modo === "parado";
  const elapsed = (now - ultimaMudanca) / 1000;
  const remaining = Math.max(0, 60 - elapsed);
  const canChange = remaining <= 0;
  const dtPos = ((dt + 5) / 25) * 100;

  useEffect(() => {
    if (!dtMarkerRef.current) return;
    animate(dtMarkerRef.current, {
      left: `${dtPos}%`,
      duration: MOTION.duration.base,
      ease: MOTION.spring,
    });
  }, [dtPos]);

  const showFeedback = (kind: "ok" | "err", text: string) => {
    setFeedback({ kind, text });
    window.setTimeout(() => setFeedback(null), 3000);
  };

  const handleMode = async (m: PumpMode) => {
    setMode(m);
    try {
      await publishControlMode(m);
      showFeedback("ok", `Modo da bomba: ${m}`);
    } catch (e) {
      showFeedback("err", e instanceof Error ? e.message : "Falha ao publicar modo");
    }
  };

  const handleStopBoth = async () => {
    setMode("parado");
    setDosingMode("parado");
    try {
      await Promise.all([publishControlMode("parado"), publishDosingMode("parado")]);
      showFeedback("ok", "Bomba e dosagem pausadas");
    } catch (e) {
      showFeedback("err", e instanceof Error ? e.message : "Falha ao publicar parada");
    }
  };

  const infoText = isParado
    ? "Sistema parado: a bomba está desligada. Selecione Automático para retomar o aquecimento solar."
    : "Modo automático: o ESP32 aciona a bomba via histerese ΔT 5°C / 1°C com anti-cycling de 60s.";

  return (
    <section
      className="rounded-xl border border-aqua-border bg-aqua-surface p-4"
      aria-label="Controle de aquecimento solar"
    >
      <div className="mb-3 flex items-center gap-2">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-aqua-accent/10 text-aqua-accent" aria-hidden>
          <Power className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-aqua-text">Aquecimento solar</h2>
          <p className="text-[11px] text-aqua-text-muted">Bomba de circulação · modo, estado e histerese ΔT</p>
        </div>
      </div>

      {/* Info contextual */}
      <div className="mb-3 flex items-start gap-2 rounded-xl border border-aqua-border bg-aqua-surface-2 p-3 text-xs text-aqua-text-muted">
        <Cpu className="mt-0.5 h-4 w-4 shrink-0 text-aqua-accent" />
        <span>{infoText}</span>
      </div>

      {feedback && (
        <div
          role="status"
          className={
            "mb-3 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs " +
            (feedback.kind === "ok"
              ? "border-status-ok/40 bg-status-ok/5 text-status-ok"
              : "border-status-crit/40 bg-status-crit/5 text-status-crit")
          }
        >
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Modo da bomba — 3 opções */}
      <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-aqua-text-muted">
        Modo da bomba
      </h3>
      <div className="grid grid-cols-2 gap-2">
        <ModeButton
          active={modo === "automatico"}
          disabled={!brokerConnected}
          icon={<Bot className="h-4 w-4" />}
          label="Automático"
          sub="Histerese ΔT no ESP32"
          onClick={() => handleMode("automatico")}
        />
        <ModeButton
          active={modo === "parado"}
          disabled={!brokerConnected}
          icon={<Ban className="h-4 w-4" />}
          label="Parado"
          sub="Bomba desativada"
          onClick={() => handleMode("parado")}
          tone="danger"
        />
      </div>
      {!brokerConnected && (
        <p className="mt-1 text-[11px] text-status-warn">Sem conexão MQTT — troca de modo indisponível.</p>
      )}

      {/* Estado da bomba */}
      <div className="mt-4">
        <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-aqua-text-muted">
          Bomba
        </h3>
        <div
          className={cn(
            "flex w-full items-center justify-between rounded-xl border-2 p-3",
            bombaOn
              ? "border-flow bg-flow/10 text-flow"
              : "border-aqua-border bg-aqua-surface-2 text-aqua-text-muted",
          )}
        >
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-full",
                bombaOn ? "bg-flow/20 aqua-pulse" : "bg-aqua-surface",
              )}
            >
              <Power className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-semibold">{bombaOn ? "BOMBA LIGADA" : "BOMBA DESLIGADA"}</div>
              <div className="text-[10px] text-aqua-text-muted">
                {canChange ? "Pronta para próximo acionamento" : `Anti-cycling: ${Math.ceil(remaining)}s`}
              </div>
            </div>
          </div>
          {!canChange && <CountdownRing seconds={Math.ceil(remaining)} />}
        </div>

      </div>

      {/* Histerese ΔT */}
      <div className="mt-4">
        <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-aqua-text-muted">
          Histerese ΔT
        </h3>
        <div className="relative h-8 overflow-hidden rounded-full border border-aqua-border bg-aqua-bg">
          <div className="absolute inset-y-0 left-0 bg-status-ok/30" style={{ width: `${(6 / 25) * 100}%` }} />
          <div className="absolute inset-y-0 bg-status-warn/25" style={{ left: `${(6 / 25) * 100}%`, width: `${(4 / 25) * 100}%` }} />
          <div className="absolute inset-y-0 bg-aqua-accent/30" style={{ left: `${(10 / 25) * 100}%`, right: 0 }} />
          <div
            ref={dtMarkerRef}
            className="absolute top-0 h-full w-1 rounded shadow-lg"
            style={{ backgroundColor: "var(--aqua-text)", left: `${dtPos}%` }}
          />
          <div className="absolute inset-0 flex items-center justify-center text-xs font-tabular font-semibold text-aqua-text drop-shadow">
            ΔT = {dt.toFixed(1)}°C
          </div>
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-aqua-text-muted">
          <span>−5°C OFF</span>
          <span>1°C zona morta</span>
          <span>+5°C ON</span>
          <span>+20°C</span>
        </div>
      </div>

      {/* Log de acionamentos */}
      <div className="mt-4">
        <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-aqua-text-muted">
          Acionamentos recentes
        </h3>
        <ul className="space-y-1">
          {log.slice(0, 4).map((e, i) => (
            <li key={`${e.t}-${i}`} className="flex items-start gap-2 rounded-lg bg-aqua-surface-2/40 p-2 text-xs">
              <span
                className={cn(
                  "mt-0.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full",
                  e.ligada ? "bg-flow" : "bg-aqua-text-muted",
                )}
              />
              <div className="flex-1">
                <div className="font-tabular text-aqua-text">
                  {new Date(e.t).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} — Bomba {e.ligada ? "LIGADA" : "DESLIGADA"}
                </div>
                <div className="text-aqua-text-muted">{e.motivo}</div>
              </div>
            </li>
          ))}
          {log.length === 0 && <li className="text-[11px] text-aqua-text-muted">Sem acionamentos.</li>}
        </ul>
      </div>

      {/* Temperatura alvo */}
      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-aqua-text-muted">
            Temperatura alvo
          </h3>
          <span className="font-tabular text-base font-semibold text-aqua-accent">{setpoint}°C</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Diminuir temperatura alvo"
            onClick={() => setSetpoint(setpoint - 1)}
            disabled={setpoint <= POOL.SETPOINT_MIN}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-aqua-border bg-aqua-surface-2/40 text-aqua-text transition-colors hover:bg-aqua-accent/10 disabled:opacity-40"
          >
            <Minus className="h-4 w-4" />
          </button>
          <input
            type="range"
            min={POOL.SETPOINT_MIN}
            max={POOL.SETPOINT_MAX}
            step={1}
            value={setpoint}
            onChange={(e) => setSetpoint(Number(e.target.value))}
            className="h-2 flex-1 cursor-pointer appearance-none rounded-full bg-aqua-surface-2 accent-aqua-accent"
            aria-label="Temperatura alvo da piscina"
          />
          <button
            type="button"
            aria-label="Aumentar temperatura alvo"
            onClick={() => setSetpoint(setpoint + 1)}
            disabled={setpoint >= POOL.SETPOINT_MAX}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-aqua-border bg-aqua-surface-2/40 text-aqua-text transition-colors hover:bg-aqua-accent/10 disabled:opacity-40"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-aqua-text-muted">
          <span>{POOL.SETPOINT_MIN}°C</span>
          <span>{POOL.SETPOINT_MAX}°C</span>
        </div>
      </div>

      {/* Parada geral — para bomba e dosagem simultaneamente */}
      <div className="mt-5 rounded-xl border border-status-crit/20 bg-status-crit/5 p-3">
        <div className="mb-2 flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 shrink-0 text-status-crit" />
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-status-crit">
            Parada geral
          </h3>
        </div>
        <p className="mb-2 text-[11px] text-aqua-text-muted">
          Pausa bomba de aquecimento e dosagem química ao mesmo tempo. Requer confirmação.
        </p>
        <HoldButton
          tone="danger"
          icon={<ShieldAlert className="h-4 w-4" />}
          disabled={!brokerConnected}
          disabledReason={!brokerConnected ? "Sem conexão MQTT" : undefined}
          onConfirm={handleStopBoth}
          subtitle="Segure 1.5s para confirmar parada"
        >
          Parar bomba e dosagem
        </HoldButton>
      </div>
    </section>
  );
}

function CountdownRing({ seconds }: { seconds: number }) {
  const pct = (seconds / 60) * 100;
  const dash = (1 - pct / 100) * 113;
  return (
    <div className="relative h-10 w-10 shrink-0">
      <svg viewBox="0 0 40 40" className="h-full w-full -rotate-90">
        <circle cx="20" cy="20" r="18" fill="none" stroke="var(--aqua-border)" strokeWidth="3" />
        <circle
          cx="20" cy="20" r="18" fill="none"
          stroke="var(--status-warn)" strokeWidth="3"
          strokeDasharray="113"
          strokeDashoffset={dash}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center font-tabular text-[10px] font-semibold text-status-warn">
        {seconds}s
      </div>
    </div>
  );
}

function ModeButton({
  active,
  disabled,
  icon,
  label,
  sub,
  onClick,
  tone = "default",
}: {
  active: boolean;
  disabled?: boolean;
  icon: React.ReactNode;
  label: string;
  sub: string;
  onClick: () => void;
  tone?: "default" | "danger";
}) {
  const isDanger = tone === "danger";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        "flex items-start gap-2 rounded-xl border-2 p-3 text-left transition-colors disabled:opacity-50",
        active
          ? isDanger
            ? "border-status-crit bg-status-crit/10 text-aqua-text"
            : "border-aqua-accent bg-aqua-accent/10 text-aqua-text"
          : isDanger
            ? "border-aqua-border bg-aqua-surface-2/40 text-aqua-text-muted hover:border-status-crit/50"
            : "border-aqua-border bg-aqua-surface-2/40 text-aqua-text-muted hover:border-aqua-accent/50",
      )}
    >
      <span
        className={active ? (isDanger ? "text-status-crit" : "text-aqua-accent") : ""}
        aria-hidden
      >
        {icon}
      </span>
      <span className="flex-1">
        <span className="block text-sm font-semibold text-aqua-text">{label}</span>
        <span className="block text-[10px] text-aqua-text-muted">{sub}</span>
      </span>
    </button>
  );
}

// ────────────────────────────────────────────────────────────────────
// Painel de diagnóstico — sensores, conexão e log MQTT
// ────────────────────────────────────────────────────────────────────

function DiagnosticsPanel() {
  const { data, sensorFailures } = useMqtt();
  const conn = useConnection();
  const now = useNow(1000);

  const wq = data?.qualidade_agua;
  const tp = data?.temperaturas;

  const live = conn.source === "mqtt" && conn.status === "connected";

  const fmtVal = (v: number | undefined, unit: string, digits = 1) => {
    if (v === undefined || isSensorError(v)) return "ERRO";
    return `${v.toFixed(digits)}${unit}`;
  };

  const sensorOnline = (v: number | undefined): boolean =>
    live && v !== undefined && !isSensorError(v);

  const latencyMs = conn.lastMessageAt != null ? Math.max(0, now - conn.lastMessageAt) : null;
  const lastMsgAgo =
    latencyMs != null ? `${Math.round(latencyMs / 1000)}s atrás` : "—";
  const latencyStr =
    latencyMs == null ? "—" : latencyMs < 1000 ? `${latencyMs}ms` : `${(latencyMs / 1000).toFixed(1)}s`;
  const latencyTone: SensorTone =
    latencyMs == null ? "neutral" : latencyMs > 15000 ? "crit" : latencyMs > 8000 ? "warn" : "ok";
  const uptime = Math.max(0, Math.round((now - conn.providerMountedAt) / 1000));
  const uptimeStr =
    uptime < 60 ? `${uptime}s` : uptime < 3600 ? `${Math.floor(uptime / 60)}min` : `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}min`;

  const totalFailures =
    sensorFailures.ph + sensorFailures.cloro + sensorFailures.alcalinidade + sensorFailures.piscina + sensorFailures.coletor;

  const connTone: SensorTone =
    conn.status === "connected" ? "ok" : conn.status === "connecting" ? "warn" : "crit";

  return (
    <section
      className="rounded-xl border border-aqua-border bg-aqua-surface p-4"
      aria-label="Diagnóstico do sistema"
    >
      <div className="mb-3 flex items-center gap-2">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-aqua-accent/10 text-aqua-accent" aria-hidden>
          <Gauge className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-aqua-text">Diagnóstico</h2>
          <p className="text-[11px] text-aqua-text-muted">Leituras dos sensores e saúde da conexão</p>
        </div>
      </div>

      <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-aqua-text-muted">
        Sensores
      </h3>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <SensorTile icon={<Droplets className="h-3.5 w-3.5" />} label="pH" value={fmtVal(wq?.ph, "", 2)} tone={statusToTone(wq?.ph_status)} online={sensorOnline(wq?.ph)} failures={sensorFailures.ph} />
        <SensorTile icon={<FlaskConical className="h-3.5 w-3.5" />} label="Cloro" value={fmtVal(wq?.cloro, " ppm")} tone={statusToTone(wq?.cloro_status)} online={sensorOnline(wq?.cloro)} failures={sensorFailures.cloro} />
        <SensorTile icon={<Beaker className="h-3.5 w-3.5" />} label="Alcalinidade" value={fmtVal(wq?.alcalinidade, " ppm", 0)} tone={statusToTone(wq?.alcalinidade_status)} online={sensorOnline(wq?.alcalinidade)} failures={sensorFailures.alcalinidade} />
        <SensorTile icon={<Waves className="h-3.5 w-3.5" />} label="Piscina" value={fmtVal(tp?.piscina_C, "°C")} tone="neutral" online={sensorOnline(tp?.piscina_C)} failures={sensorFailures.piscina} />
        <SensorTile icon={<Sun className="h-3.5 w-3.5" />} label="Coletor" value={fmtVal(tp?.coletor_solar_C, "°C")} tone="neutral" online={sensorOnline(tp?.coletor_solar_C)} failures={sensorFailures.coletor} />
        <SensorTile icon={<Thermometer className="h-3.5 w-3.5" />} label="ΔT" value={fmtVal(tp?.delta_T, "°C")} tone="neutral" online={sensorOnline(tp?.delta_T)} />
      </div>

      <h3 className="mb-1.5 mt-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-aqua-text-muted">
        Conexão MQTT
      </h3>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <SensorTile icon={<Radio className="h-3.5 w-3.5" />} label="Status" value={conn.status} tone={connTone} />
        <SensorTile icon={<Database className="h-3.5 w-3.5" />} label="Fonte" value={conn.source} tone={conn.source === "mqtt" ? "ok" : conn.source === "fallback" ? "warn" : "neutral"} />
        <SensorTile icon={<CircleDot className="h-3.5 w-3.5" />} label="Ciclo" value={conn.cycle != null ? String(conn.cycle) : "—"} tone="neutral" />
        <SensorTile icon={<Activity className="h-3.5 w-3.5" />} label="Mensagens" value={String(conn.messagesReceivedCount)} tone="neutral" />
        <SensorTile icon={<TriangleAlert className="h-3.5 w-3.5" />} label="Falhas sensor" value={String(totalFailures)} tone={totalFailures > 0 ? "warn" : "ok"} />
        <SensorTile icon={<Clock className="h-3.5 w-3.5" />} label="Latência" value={latencyStr} tone={latencyTone} />
      </div>

      <div className="mt-2 text-[10px] text-aqua-text-muted">
        Última mensagem {lastMsgAgo} · gaps de ciclo: {conn.totalGaps} · sessão ativa há {uptimeStr} · valor de erro de sensor: {SENSOR_ERROR_VALUE}
      </div>

      <TopicMapSection />

      <div className="mt-4">
        <MqttLog />
      </div>
    </section>
  );
}

function TopicMapSection() {
  const [open, setOpen] = useState(false);
  return (
    <section className="mt-4 rounded-xl border border-aqua-border bg-aqua-surface">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2">
          {open ? <ChevronDown className="h-4 w-4 text-aqua-text-muted" /> : <ChevronRight className="h-4 w-4 text-aqua-text-muted" />}
          <Database className="h-4 w-4 text-aqua-accent" />
          <h3 className="text-sm font-semibold text-aqua-text">Mapeamento de tópicos MQTT</h3>
        </div>
        <span className="text-[10px] uppercase tracking-wider text-aqua-text-muted">
          comando / telemetria
        </span>
      </button>

      {open && (
        <div className="space-y-3 border-t border-aqua-border px-4 py-3">
          <TopicGroup title="Comandos (dashboard → firmware)" entries={COMMAND_TOPIC_MAP} />
          <TopicGroup title="Telemetria (firmware → dashboard)" entries={TELEMETRY_TOPIC_MAP} />
        </div>
      )}
    </section>
  );
}

function TopicGroup({ title, entries }: { title: string; entries: readonly TopicMapEntry[] }) {
  return (
    <div>
      <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-aqua-text-muted">
        {title}
      </h4>
      <ul className="divide-y divide-aqua-border/60 overflow-hidden rounded-lg border border-aqua-border">
        {entries.map((e) => (
          <li key={`${e.id}-${e.topic}-${e.field ?? ""}`} className="bg-aqua-surface-2/30 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-aqua-text">{e.label}</span>
              <code className="truncate font-mono text-[10px] text-aqua-accent">{e.topic}</code>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[10px] text-aqua-text-muted">
              {e.field && <span>campo: dados.{e.field}</span>}
              {e.granular && <span>· granular: {e.granular}</span>}
            </div>
            <div className="truncate font-mono text-[10px] text-aqua-text-muted">{e.payload}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}

type SensorTone = "ok" | "warn" | "crit" | "neutral";

function statusToTone(s: import("@/types/firmware").WaterStatus | undefined): SensorTone {
  if (s === "BAIXO" || s === "ALTO") return "warn";
  if (s === "OK") return "ok";
  return "neutral";
}

function SensorTile({
  icon,
  label,
  value,
  tone,
  online,
  failures,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: SensorTone;
  online?: boolean;
  failures?: number;
}) {
  const toneClass =
    tone === "ok"
      ? "text-status-ok"
      : tone === "warn"
        ? "text-status-warn"
        : tone === "crit"
          ? "text-status-crit"
          : "text-aqua-text";
  return (
    <div className="rounded-lg border border-aqua-border bg-aqua-surface-2/40 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-aqua-text-muted">
        <span className={toneClass} aria-hidden>{icon}</span>
        <span className="truncate">{label}</span>
        {online !== undefined && (
          <span
            className={
              "ml-auto inline-block h-1.5 w-1.5 shrink-0 rounded-full " +
              (online ? "bg-status-ok" : "bg-status-crit")
            }
            role="img"
            aria-label={online ? "online" : "offline"}
            title={online ? "online" : "offline"}
          />
        )}
      </div>
      <div className="flex items-baseline justify-between gap-1">
        <div className={`mt-0.5 font-tabular text-base font-semibold capitalize ${toneClass}`}>
          {value}
        </div>
        {failures !== undefined && failures > 0 && (
          <span className="shrink-0 font-tabular text-[10px] font-medium text-status-warn" title="Falhas de leitura na sessão">
            {failures} falha{failures > 1 ? "s" : ""}
          </span>
        )}
      </div>
    </div>
  );
}
