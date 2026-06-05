import { useState } from "react";
import { Droplets, FlaskConical, Beaker, Bot, Hand, CheckCircle2 } from "lucide-react";
import { HoldButton } from "@/components/HoldButton";
import { usePublishDosingCommand, usePublishDosingMode, useConnection } from "@/hooks/useAquaSense";
import { usePoolStore } from "@/store/poolStore";
import { useNow } from "@/hooks/useNow";
import { isSensorError } from "@/types/firmware";
import { reasonToBlockDose as computeBlockReason } from "@/lib/dosingGuards";
import type { DoseChemical } from "@/types/firmware";
import type { PumpMode } from "@/types/aquasense";

// Menu de dosagens manuais + seletor de modo de operação.
// A prop `show` controla quais blocos renderizar, permitindo posicionar a
// dose manual e o modo de operação em locais diferentes do layout.

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

const MODES: ReadonlyArray<{ key: PumpMode; label: string; desc: string; icon: React.ReactNode }> =
  [
    {
      key: "automatico",
      label: "Automático",
      desc: "Sistema decide dosagens conforme leituras dos sensores.",
      icon: <Bot className="h-4 w-4" />,
    },
    {
      key: "manual",
      label: "Manual",
      desc: "Aguardando comando do operador. Sem dosagem automática.",
      icon: <Hand className="h-4 w-4" />,
    },
  ];

function formatSince(t: number | null, now: number): string | null {
  if (t == null) return null;
  const s = Math.floor(Math.max(0, now - t) / 1000);
  if (s < 60) return `há ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `há ${m}min`;
  const h = Math.floor(m / 60);
  return `há ${h}h ${m % 60}min`;
}

export function DosingModePanel({ show = "both" }: { show?: "both" | "dose" | "mode" }) {
  const publishDosingCommand = usePublishDosingCommand();
  const publishDosingMode = usePublishDosingMode();
  const conn = useConnection();
  const ph = usePoolStore((s) => s.ph);
  const cloro = usePoolStore((s) => s.cloro);
  const modo = usePoolStore((s) => s.dosagem_modo);
  const setMode = usePoolStore((s) => s.setDosingMode);
  const ultimaDosePorProduto = usePoolStore((s) => s.ultimaDosePorProduto);
  const doseTimestamps = usePoolStore((s) => s.doseTimestamps);
  const now = useNow(30_000);

  // Contagem de doses do dia, por produto e total.
  const startMs = (() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return start.getTime();
  })();
  const todays = doseTimestamps.filter((d) => d.t >= startMs);
  const countByChem = (chem: DoseChemical) => todays.filter((d) => d.chem === chem).length;
  const dosesHoje = todays.length;

  const [feedback, setFeedback] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [pendingDose, setPendingDose] = useState<DoseChemical | null>(null);

  const hasLiveFirmware = conn.status === "connected" && conn.source === "mqtt";

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

  const reasonToBlockDose = (chem: DoseChemical): string | null => {
    const meta = CHEMICALS.find((c) => c.key === chem);
    const sensorValue = meta ? (meta.sensorPath === "ph" ? ph : cloro) : ph;
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

  const activeMode = MODES.find((m) => m.key === modo) ?? MODES[0];

  const doseArticle = (
    <article className="rounded-3xl border border-aqua-border bg-aqua-surface p-6 shadow-aqua">
      <header className="mb-4 flex items-center justify-between gap-2">
        <h3 className="font-display text-lg font-semibold text-aqua-text">Dose manual</h3>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-aqua-border bg-aqua-bg/60 px-2.5 py-1 text-[11px] font-semibold text-aqua-text tnum">
            {dosesHoje} {dosesHoje === 1 ? "dose hoje" : "doses hoje"}
          </span>
          <span className="hidden sm:inline text-[10px] uppercase tracking-widest text-aqua-text-muted">
            Segure 1.5s para confirmar
          </span>
        </div>
      </header>

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

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {CHEMICALS.map((c) => {
          const reason = reasonToBlockDose(c.key);
          const last = formatSince(ultimaDosePorProduto[c.key], now);
          const count = countByChem(c.key);
          const subtitle = last ? `${c.subtitle} · última ${last}` : c.subtitle;
          return (
            <div key={c.key} className="relative">
              <span
                className="absolute right-2 top-2 z-10 inline-flex min-w-[1.5rem] items-center justify-center rounded-full border border-aqua-border bg-aqua-bg px-1.5 py-0.5 text-[10px] font-bold text-aqua-text tnum"
                title={`${count} ${count === 1 ? "dose" : "doses"} hoje`}
              >
                {count}
              </span>
              <HoldButton
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
            </div>
          );
        })}
      </div>
    </article>
  );

  const modeArticle = (
    <article className="w-full h-full rounded-3xl border border-aqua-border bg-aqua-surface p-6 shadow-aqua flex flex-col">
      <header className="mb-5 flex items-start justify-between gap-2">
        <div>
          <h3 className="font-display text-lg font-semibold text-aqua-text">Modo de dosagem</h3>
          <p className="text-xs text-aqua-text-muted mt-1">Independente da bomba de aquecimento.</p>
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

      <div
        role="radiogroup"
        aria-label="Modo de operação"
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
                void publishDosingMode(m.key).catch(() => undefined);
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
          <p className="text-[11px] leading-relaxed text-aqua-text-muted">{activeMode.desc}</p>
        </div>
      </div>
    </article>
  );

  if (show === "dose") return doseArticle;
  if (show === "mode") return modeArticle;

  return (
    <section className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
      {doseArticle}
      {modeArticle}
    </section>
  );
}
