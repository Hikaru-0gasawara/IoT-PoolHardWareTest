import { useEffect, useRef, useState } from "react";
import {
  Info,
  FlaskConical,
  Beaker,
  Power,
  Droplets,
  ShieldCheck,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Circle,
  Sparkles,
  Settings2,
  Hand,
  Bot,
  CircleDot,
  Activity,
  Wifi,
  WifiOff,
  TriangleAlert,
} from "lucide-react";
import { useMqtt } from "@/providers/MqttProvider";
import { HoldButton } from "@/components/HoldButton";
import { isSensorError } from "@/types/firmware";
import { usePoolStore } from "@/store/poolStore";
import { useNow } from "@/hooks/useNow";
import type { DoseChemical, DosingResponse } from "@/types/firmware";

// Mapeamento canônico dos 3 produtos químicos das dosadoras peristálticas.
// Tom da UI segue a categoria de risco percebida (cloro = mais crítico).
const CHEMICALS: ReadonlyArray<{
  key: DoseChemical;
  label: string;
  subtitle: string;
  tone: "danger" | "warn";
  icon: React.ReactNode;
  /** Parâmetro do `data` que precisa estar válido para liberar dose */
  sensorPath: "orp_mv" | "ph";
}> = [
  {
    key: "cloro",
    label: "Dose de Cloro",
    subtitle: "Bomba peristáltica · GPIO 25",
    tone: "danger",
    icon: <Droplets className="h-4 w-4" />,
    sensorPath: "orp_mv",
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

// Aba "Controle Avançado" — puramente informativa.
//
// Razão de existir: o firmware v4.0 evoluiu para sistema de controle ativo
// (dosagem química autônoma). Antes de qualquer linha de código de controle
// entrar em produção, o roadmap precisa estar documentado e visível para
// banca/operador/orientador. Esta aba é o "documento", não o "dashboard".
//
// Convenção visual deliberada:
//   - Sem números dinâmicos. Sem leitura do MqttProvider. Sem useNow.
//   - Estado dinâmico (modo, E-Stop, dose em andamento) vive na aba
//     Diagnóstico. Misturar aqui transformaria o documento em painel.
//   - Itens de hardware "Planejado" / "Em simulação Wokwi" ficam visualmente
//     muted — sinaliza que existe, mas não está em produção real.

const HARDWARE_ITEMS: ReadonlyArray<{
  icon: React.ReactNode;
  name: string;
  fn: string;
  status: "planejado" | "wokwi";
}> = [
  {
    icon: <FlaskConical className="h-4 w-4" />,
    name: "Sensor de pH redundante",
    fn: "2º sensor para detectar drift do principal",
    status: "planejado",
  },
  {
    icon: <Beaker className="h-4 w-4" />,
    name: "Sensor de cloro redundante",
    fn: "2º sensor para detectar discordância",
    status: "planejado",
  },
  {
    icon: <Droplets className="h-4 w-4" />,
    name: "3× bombas dosadoras peristálticas",
    fn: "Cloro, ácido (pH-), base (pH+)",
    status: "wokwi",
  },
  {
    icon: <Beaker className="h-4 w-4" />,
    name: "3× reservatórios químicos",
    fn: "Sensor de nível para evitar dosagem com tanque vazio",
    status: "planejado",
  },
  {
    icon: <Power className="h-4 w-4" />,
    name: "E-Stop físico",
    fn: "Botão de emergência cortando 220V independente do software",
    status: "wokwi",
  },
];

const SAFETY_LAYERS: ReadonlyArray<{
  icon: React.ReactNode;
  title: string;
  desc: string;
}> = [
  {
    icon: <Power className="h-3.5 w-3.5" />,
    title: "E-Stop ativo",
    desc: "Nada dosa, sem exceção. Verificação primeiro em hardware, depois em firmware.",
  },
  {
    icon: <ShieldCheck className="h-3.5 w-3.5" />,
    title: "Modo de operação",
    desc: "Só dosa em modo \"auto\". Boot conservador em \"manual\".",
  },
  {
    icon: <AlertTriangle className="h-3.5 w-3.5" />,
    title: "Sensor com erro",
    desc: "Leitura inválida (-99.0) bloqueia dosagem do parâmetro afetado.",
  },
  {
    icon: <Droplets className="h-3.5 w-3.5" />,
    title: "Dose em andamento",
    desc: "Uma dosadora por vez, nunca simultaneamente.",
  },
  {
    icon: <Clock className="h-3.5 w-3.5" />,
    title: "Dead time",
    desc: "30-60 min entre doses do mesmo produto, esperando mistura completa.",
  },
  {
    icon: <ShieldCheck className="h-3.5 w-3.5" />,
    title: "Interlock pH/cloro",
    desc: "Não dosar ácido/base simultaneamente com cloro — risco de gás cloro tóxico.",
  },
  {
    icon: <Clock className="h-3.5 w-3.5" />,
    title: "Limite horário",
    desc: "Máximo de doses por hora — proteção contra loop de feedback.",
  },
  {
    icon: <Clock className="h-3.5 w-3.5" />,
    title: "Limite diário",
    desc: "Máximo de doses por dia — proteção contra falha crônica de sensor.",
  },
];

const REGULATIONS: ReadonlyArray<{ ref: string; desc: string }> = [
  {
    ref: "NBR 10818",
    desc: "Norma técnica de qualidade da água em piscinas — faixas de pH, cloro e alcalinidade que o sistema usa como referência.",
  },
  {
    ref: "ANVISA",
    desc: "Regulação de produtos químicos para piscina — dosadoras precisam usar produtos certificados.",
  },
  {
    ref: "NBR 13534",
    desc: "Instalações elétricas em locais úmidos — E-Stop físico, isolamento de relés.",
  },
  {
    ref: "Responsabilidade civil",
    desc: "Em piscinas comerciais (hotéis, clubes), incidente com banhista por dosagem incorreta tem implicação legal séria. Sistema autônomo precisa de log persistente como prova de auditoria.",
  },
];

export function AdvancedControlPanel() {
  return (
    <div className="space-y-4">
      {/* Painel funcional — comandos ativos + estado em tempo real */}
      <LivePanel />

      {/* Divisor visual entre painel operacional e documentação */}
      <div className="flex items-center gap-3 pt-2">
        <span className="h-px flex-1 bg-aqua-border" aria-hidden />
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-aqua-text-muted">
          Documentação do roadmap
        </span>
        <span className="h-px flex-1 bg-aqua-border" aria-hidden />
      </div>

      {/* Banner de contexto — neutro, não é alerta */}
      <div className="flex items-start gap-2.5 rounded-xl border border-aqua-border bg-aqua-surface/60 px-3.5 py-3 text-xs leading-relaxed text-aqua-text-muted">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-aqua-accent" aria-hidden />
        <span>
          As seções abaixo documentam a <strong className="text-aqua-text">evolução planejada</strong> do
          sistema (hardware adicional, camadas de segurança, regulação). O painel
          operacional acima já envia comandos reais via MQTT — em ambiente
          acadêmico Wokwi os comandos acendem LEDs como proxy das bombas.
        </span>
      </div>


      {/* Seção 1 — Visão geral */}
      <Section title="Visão geral">
        <p className="text-sm leading-relaxed text-aqua-text-muted">
          O AquaSense atual lê sensores e exibe dados (monitor passivo). A
          evolução planejada vira sistema de <strong className="text-aqua-text">controle ativo</strong>:
          o ESP32 decide adicionar cloro, ajustar pH e acionar dosadoras químicas
          autonomamente baseado nas leituras.
        </p>
        <p className="mt-2.5 text-sm leading-relaxed text-aqua-text-muted">
          Essa transição muda a categoria de produto: erro do sistema deixa
          de ser "número errado na tela" e passa a ser{" "}
          <strong className="text-aqua-text">"produto químico errado em piscina real"</strong>.
          Por isso o roadmap inclui camadas de segurança antes de qualquer
          linha de código de controle ativo entrar em produção.
        </p>
      </Section>

      {/* Seção 2 — Hardware adicional */}
      <Section title="Hardware adicional necessário">
        <ul className="divide-y divide-aqua-border/60">
          {HARDWARE_ITEMS.map((it) => (
            <li
              key={it.name}
              className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0 opacity-70"
            >
              <span
                className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-aqua-surface-2 text-aqua-text-muted"
                aria-hidden
              >
                {it.icon}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-aqua-text">{it.name}</div>
                <div className="text-xs text-aqua-text-muted">{it.fn}</div>
              </div>
              <span
                className={
                  "shrink-0 self-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide " +
                  (it.status === "wokwi"
                    ? "border-aqua-accent/40 text-aqua-accent"
                    : "border-aqua-border text-aqua-text-muted")
                }
              >
                {it.status === "wokwi" ? "Em simulação Wokwi" : "Planejado"}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      {/* Seção 3 — Camadas de segurança */}
      <Section title="Camadas de segurança previstas">
        <ol className="space-y-2.5">
          {SAFETY_LAYERS.map((layer, idx) => (
            <li
              key={layer.title}
              className="flex items-start gap-3 rounded-lg border border-aqua-border/60 bg-aqua-surface-2/40 px-3 py-2"
            >
              <span
                className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-aqua-accent/10 font-tabular text-[11px] font-semibold text-aqua-accent"
                aria-hidden
              >
                {idx + 1}
              </span>
              <span className="mt-1 shrink-0 text-aqua-text-muted" aria-hidden>
                {layer.icon}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-aqua-text">{layer.title}</div>
                <div className="text-xs leading-relaxed text-aqua-text-muted">{layer.desc}</div>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      {/* Seção 4 — Regulação */}
      <Section title="Considerações regulatórias" tone="warn">
        <dl className="space-y-2.5">
          {REGULATIONS.map((r) => (
            <div key={r.ref} className="grid grid-cols-1 gap-0.5 sm:grid-cols-[180px_1fr] sm:gap-3">
              <dt className="text-xs font-semibold uppercase tracking-wide text-status-warn">
                {r.ref}
              </dt>
              <dd className="text-xs leading-relaxed text-aqua-text-muted">{r.desc}</dd>
            </div>
          ))}
        </dl>
      </Section>

      {/* Seção 5 — Timeline */}
      <Section title="Status atual e próximas fases">
        <ol className="space-y-3">
          <PhaseItem
            icon={<CheckCircle2 className="h-4 w-4" />}
            tone="ok"
            label="Fase 1 (atual) — Monitor passivo"
            desc="ESP32 lê sensores, controla bomba de circulação por histerese, publica via MQTT. Dashboard exibe."
          />
          <PhaseItem
            icon={<Sparkles className="h-4 w-4" />}
            tone="active"
            label="Fase 2 (em design) — Controle autônomo simplificado"
            desc="Ambiente acadêmico (Wokwi). LEDs como proxies de relés, 8 camadas de segurança implementadas, comandos manuais via dashboard."
          />
          <PhaseItem
            icon={<Circle className="h-4 w-4" />}
            tone="future"
            label="Fase 3 (futuro) — Hardware comercial real"
            desc="Redundância de sensores, certificação regulatória, log persistente para auditoria, monitoramento remoto profissional."
          />
        </ol>
      </Section>
    </div>
  );
}

function Section({
  title,
  tone = "neutral",
  children,
}: {
  title: string;
  tone?: "neutral" | "warn";
  children: React.ReactNode;
}) {
  const borderClass =
    tone === "warn" ? "border-status-warn/30 bg-status-warn/[0.04]" : "border-aqua-border bg-aqua-surface";
  return (
    <section className={`rounded-xl border p-4 ${borderClass}`}>
      <h2 className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-aqua-text-muted">
        {title}
      </h2>
      {children}
    </section>
  );
}

function PhaseItem({
  icon,
  tone,
  label,
  desc,
}: {
  icon: React.ReactNode;
  tone: "ok" | "active" | "future";
  label: string;
  desc: string;
}) {
  const color =
    tone === "ok"
      ? "var(--status-ok)"
      : tone === "active"
        ? "var(--aqua-accent)"
        : "var(--aqua-text-muted)";
  const opacity = tone === "future" ? "opacity-60" : "";
  return (
    <li className={`flex items-start gap-3 ${opacity}`}>
      <span
        className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: `color-mix(in oklab, ${color} 18%, transparent)`, color }}
        aria-hidden
      >
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-aqua-text">{label}</div>
        <div className="text-xs leading-relaxed text-aqua-text-muted">{desc}</div>
      </div>
    </li>
  );
}

// ────────────────────────────────────────────────────────────────────
// Painel funcional — comandos ativos + estado em tempo real
// ────────────────────────────────────────────────────────────────────

function LivePanel() {
  const {
    status,
    source,
    data,
    dosingResponses,
    publishDosingCommand,
  } = useMqtt();

  const [feedback, setFeedback] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [pendingDose, setPendingDose] = useState<DoseChemical | null>(null);
  const ultimaDosePorProduto = usePoolStore((s) => s.ultimaDosePorProduto);
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

  // Razão de bloqueio para cada dose. Retorna null = liberado.
  const reasonToBlockDose = (chem: DoseChemical): string | null => {
    if (!hasLiveFirmware) return "Sem telemetria real do ESP32 — comandos bloqueados";
    // Bloqueio por sensor inválido — só faz sentido para o parâmetro
    // que aquela dosadora corrige.
    const meta = CHEMICALS.find((c) => c.key === chem);
    if (meta && data) {
      const value =
        meta.sensorPath === "ph"
          ? data.qualidade_agua.ph
          : data.qualidade_agua.orp_mv;
      if (isSensorError(value)) {
        return `Sensor de ${meta.sensorPath === "ph" ? "pH" : "ORP"} com erro — dose bloqueada`;
      }
    }
    return null;
  };

  // Formata "há 1h 23m" / "há 5min" / "há 12s".
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
      aria-label="Painel de controle ativo"
    >
      {/* Header */}
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-aqua-accent/10 text-aqua-accent" aria-hidden>
            <Settings2 className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-aqua-text">Painel operacional</h2>
            <p className="text-[11px] text-aqua-text-muted">
              Dosagem manual via MQTT — estado em tempo real
            </p>
          </div>
        </div>
        <ConnectionPill brokerConnected={brokerConnected} hasLiveFirmware={hasLiveFirmware} />
      </div>

      {/* Cards de estado em tempo real */}
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

      {/* Feedback efêmero */}
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

      {/* Botões de dose manual */}
      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-aqua-text-muted">
            Dose manual
          </h3>
          <span className="text-[10px] text-aqua-text-muted">
            Segure 1.5s para confirmar
          </span>
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

      {/* Últimas respostas de dosagem */}
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

function ModeButton({
  active,
  disabled,
  disabledReason,
  loading,
  onClick,
  icon,
  label,
  desc,
}: {
  active: boolean;
  disabled: boolean;
  disabledReason?: string;
  loading: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      disabled={disabled}
      onClick={onClick}
      title={disabled ? disabledReason : undefined}
      className={[
        "flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aqua-accent/40",
        active
          ? "border-aqua-accent bg-aqua-accent/10"
          : "border-aqua-border bg-aqua-surface-2/40 hover:border-aqua-border/80",
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
      ].join(" ")}
    >
      <span
        className={
          "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg " +
          (active ? "bg-aqua-accent/20 text-aqua-accent" : "bg-aqua-surface text-aqua-text-muted")
        }
        aria-hidden
      >
        {loading ? <Activity className="h-4 w-4 animate-pulse" /> : icon}
      </span>
      <span className="flex-1 min-w-0">
        <span className={"block text-sm font-semibold " + (active ? "text-aqua-accent" : "text-aqua-text")}>
          {label}
        </span>
        <span className="block text-[11px] text-aqua-text-muted">{desc}</span>
      </span>
    </button>
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
