import { useMemo } from "react";
import {
  Activity,
  Clock,
  AlertTriangle,
  Cpu,
  Info,
  CheckCircle2,
  Droplets,
} from "lucide-react";
import {
  useConnection,
  useControlState,
  useDosingEvents,
  useSystemHealth,
} from "@/hooks/useAquaSense";
import { useNow } from "@/hooks/useNow";
import { usePoolStore } from "@/store/poolStore";
import { describeMqttStatus, formatAge, toneToColor } from "@/lib/mqttStatus";
import { usePersistentState } from "@/hooks/usePersistentState";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { GAP_BUFFER_MAX } from "@/lib/cycleGaps";
import type { DoseChemical } from "@/types/firmware";


// v4.0 — health considerado "stale" se passou mais de 5min sem nova mensagem.
// Firmware publica a cada 60s; 5min = 5 ciclos perdidos = degradação real,
// não um flap pontual.
const HEALTH_STALE_MS = 5 * 60 * 1000;

const DOSE_LABEL: Record<DoseChemical, string> = {
  cloro: "Cloro",
  acido: "Ácido (pH-)",
  base: "Base (pH+)",
};

const DOSE_COLOR: Record<DoseChemical, string> = {
  cloro: "var(--param-pool)", // azul
  acido: "var(--param-solar)", // amarelo
  base: "var(--aqua-text-muted)", // branco/neutro
};

// Aba Diagnóstico — densidade técnica, audiência interna.
// Tudo que depende de tempo (uptime, "há Xs") usa useNow(2000).
// Sem inventar dado: campos que dependem de firmware ficam como
// placeholders desabilitados com Popover explicativo.

type DiagnosticFilter = "tudo" | "problemas";

const isDiagnosticFilter = (v: unknown): v is DiagnosticFilter => v === "tudo" || v === "problemas";

function formatUptime(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function formatRelative(now: number, t: number | null): string {
  if (t == null) return "—";
  const dt = now - t;
  if (dt < 10_000) return "agora mesmo";
  return formatAge(dt);
}

export function DiagnosticPanel() {
  const conn = useConnection();
  const now = useNow(2000);
  const view = describeMqttStatus(conn.status, conn.source, conn.lastMessageAt, now);

  const controlState = useControlState();
  const dosingEvents = useDosingEvents();
  const health = useSystemHealth();
  const healthStale = health != null && now - health.t > HEALTH_STALE_MS;

  const opened = usePoolStore((s) => s.sessionAlertsOpened);
  const escalated = usePoolStore((s) => s.sessionAlertsEscalated);
  const resolved = usePoolStore((s) => s.sessionAlertsResolved);
  const alerts = usePoolStore((s) => s.alerts);

  const [filter, setFilter] = usePersistentState<DiagnosticFilter>(
    "aquasense.diagnostico.filter",
    "tudo",
    isDiagnosticFilter,
  );

  // Tempo médio de resolução: derivado do array de alerts (sem contador
  // separado). Filtra resolvidos com timestamps válidos e tira a média.
  const avgResolutionMs = useMemo(() => {
    const resolvedAlerts = alerts.filter((a) => a.status === "resolvido" && a.resolvido_em != null);
    if (resolvedAlerts.length === 0) return null;
    const total = resolvedAlerts.reduce(
      (acc, a) => acc + ((a.resolvido_em ?? 0) - a.iniciado_em),
      0,
    );
    return Math.round(total / resolvedAlerts.length);
  }, [alerts]);

  // Maior intervalo entre mensagens consecutivas — derivado do array de
  // gaps detectados. Cada gap em ciclos vira intervalo aproximado em ms
  // multiplicando pelo período do firmware (5s). Aproximação consciente:
  // o firmware pode ter mudado de cadência, mas sem timestamp da mensagem
  // perdida, esta é a melhor estimativa que não inventa dado.
  const maxGapMs = useMemo(() => {
    if (conn.gaps.length === 0) return 0;
    const maxMissed = conn.gaps.reduce((m, g) => Math.max(m, g.missed), 0);
    // (missed + 1) intervalos × 5s. +1 porque "missed" mensagens perdidas
    // representam missed+1 períodos sem entrega.
    return (maxMissed + 1) * 5000;
  }, [conn.gaps]);

  const dashboardUptimeMs = now - conn.providerMountedAt;
  const cyclesPerMin =
    dashboardUptimeMs > 60_000 && conn.messagesReceivedCount > 0
      ? conn.messagesReceivedCount / (dashboardUptimeMs / 60_000)
      : null;

  const ativos = alerts.filter((a) => a.status === "ativo" && !a.id.startsWith("shadow:"));
  const totalAtivos = ativos.length;

  // Filtro "Apenas com problema": esconde seções inteiramente "saudáveis".
  const isProblematic = {
    mqtt: view.tone === "warn" || view.tone === "crit" || conn.totalGaps > 0,
    sessao: false, // sessão não tem critério de "problema"
    alertas: totalAtivos > 0 || escalated > 0,
    // v4.0 — firmware vira "problema" só se health ainda não chegou OU
    // está stale OU há contadores de erro positivos no DHT/DS18B20.
    firmware:
      health == null || healthStale || (health.dht_errors ?? 0) > 0 || (health.ds_errors ?? 0) > 0,
    // v4.0 — controle problemático = E-Stop ativo OU eventos blocked recentes.
    // Modo "manual" não conta como problema (é estado intencional).
    controle:
      controlState?.estop === true ||
      dosingEvents.some((e) => e.event === "blocked" && now - e.t < 5 * 60 * 1000),
  };
  const showProblemsOnly = filter === "problemas";

  // Estado vazio do filtro "Apenas com problema": quando nenhuma seção
  // técnica tem problema, sobra só Firmware. Sem contexto, isso parece
  // ambíguo — banner explicita que está tudo OK e os placeholders são
  // expectativa de evolução, não falha.
  const allHealthy =
    !isProblematic.mqtt &&
    !isProblematic.sessao &&
    !isProblematic.alertas &&
    !isProblematic.controle;
  const showHealthyBanner = showProblemsOnly && allHealthy;

  return (
    <div className="space-y-4">
      {/* Sub-filtro persistente */}
      <div className="flex items-center gap-2 text-xs">
        <span className="text-aqua-text-muted">Mostrar:</span>
        <FilterChip active={filter === "tudo"} onClick={() => setFilter("tudo")}>
          Tudo
        </FilterChip>
        <FilterChip active={filter === "problemas"} onClick={() => setFilter("problemas")}>
          Apenas com problema
        </FilterChip>
      </div>

      {showHealthyBanner && (
        <div className="flex items-start gap-2 rounded-xl border border-aqua-border bg-aqua-surface/50 px-3 py-2.5 text-xs text-aqua-text-muted">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400/80" />
          <span>
            Nenhum problema detectado no momento. Os placeholders abaixo aguardam atualização do
            firmware.
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* A — Saúde do canal MQTT */}
        {(!showProblemsOnly || isProblematic.mqtt) && (
          <Section title="Saúde do canal MQTT" icon={<Activity className="h-3.5 w-3.5" />}>
            <Row k="Status" v={view.label} valColor={toneToColor(view.tone)} />
            <Row k="Última mensagem" v={formatRelative(now, conn.lastMessageAt)} />
            <Row k="Mensagens recebidas" v={conn.messagesReceivedCount.toString()} />
            <Row
              k="Gaps detectados"
              v={conn.totalGaps === 0 ? "0" : `${conn.totalGaps}`}
              detail={
                conn.totalGaps > 0
                  ? `últimos ${Math.min(conn.gaps.length, GAP_BUFFER_MAX)} retidos`
                  : undefined
              }
            />
            <Row
              k="Maior intervalo"
              v={maxGapMs === 0 ? "—" : formatUptime(maxGapMs)}
              detail={maxGapMs === 0 ? "nenhum gap registrado" : "estimado a partir dos gaps"}
            />
          </Section>
        )}

        {/* B — Sessão do dashboard */}
        {(!showProblemsOnly || isProblematic.sessao) && (
          <Section title="Sessão do dashboard" icon={<Clock className="h-3.5 w-3.5" />}>
            <Row k="Dashboard ativo há" v={formatUptime(dashboardUptimeMs)} />
            <Row k="Ciclos recebidos" v={conn.messagesReceivedCount.toString()} />
            <Row k="Último ciclo" v={conn.cycle?.toString() ?? "—"} />
            <Row
              k="Taxa média"
              v={cyclesPerMin == null ? "—" : `${cyclesPerMin.toFixed(1)} ciclos/min`}
              detail={cyclesPerMin == null ? "aguardando ≥ 1 min de dados" : undefined}
            />
          </Section>
        )}

        {/* C — Alertas da sessão */}
        {(!showProblemsOnly || isProblematic.alertas) && (
          <Section title="Alertas da sessão" icon={<AlertTriangle className="h-3.5 w-3.5" />}>
            <Row k="Total abertos" v={opened.toString()} />
            <Row k="Escalados (warn → crit)" v={escalated.toString()} />
            <Row k="Resolvidos" v={resolved.toString()} />
            <Row
              k="Tempo médio de resolução"
              v={avgResolutionMs == null ? "—" : formatUptime(avgResolutionMs)}
              detail={avgResolutionMs == null ? "nenhum alerta resolvido nesta sessão" : undefined}
            />
          </Section>
        )}

        {/* D — Firmware (placeholders) */}
        {(!showProblemsOnly || isProblematic.firmware) && (
          <Section title="Firmware" icon={<Cpu className="h-3.5 w-3.5" />}>
            {/* v4.0 — placeholders viram dados reais quando system/health chega.
                Se passou >5min sem health, o cabeçalho indica staleness. */}
            {healthStale && (
              <div className="mb-2 rounded-md border border-status-warn/40 bg-status-warn/10 px-2 py-1 text-[10px] text-status-warn">
                Última atualização há {formatAge(now - (health?.t ?? now))} — dados podem estar
                desatualizados
              </div>
            )}
            {health == null ? (
              <>
                <FirmwarePlaceholder label="RSSI Wi-Fi" />
                <FirmwarePlaceholder label="Uptime ESP32" />
                <FirmwarePlaceholder label="Heap livre" />
                <FirmwarePlaceholder label="Erros DHT/DS18B20" />
              </>
            ) : (
              <>
                <Row
                  k="RSSI Wi-Fi"
                  v={health.wifi_rssi_dbm != null ? `${health.wifi_rssi_dbm} dBm` : "—"}
                />
                <Row
                  k="Uptime ESP32"
                  v={health.uptime_s != null ? formatUptime(health.uptime_s * 1000) : "—"}
                />
                <Row
                  k="Heap livre"
                  v={health.free_heap_kb != null ? `${health.free_heap_kb} KB` : "—"}
                />
                <Row
                  k="Erros DHT/DS18B20"
                  v={`${health.dht_errors ?? 0} / ${health.ds_errors ?? 0}`}
                  valColor={
                    (health.dht_errors ?? 0) + (health.ds_errors ?? 0) > 0
                      ? "var(--status-warn)"
                      : undefined
                  }
                />
              </>
            )}
          </Section>
        )}

        {/* E — Controle de Dosagem (v4.0). Só mostra se firmware publicou
             ALGUM sinal de v4.0 (controlState ou dosingEvents). Senão fica
             oculto: monitor passivo não tem controle pra exibir. */}
        {(controlState != null || dosingEvents.length > 0) &&
          (!showProblemsOnly || isProblematic.controle) && (
            <Section title="Controle de Dosagem" icon={<Droplets className="h-3.5 w-3.5" />}>
              <ControlDosingContent
                controlState={controlState}
                dosingEvents={dosingEvents}
                health={health}
                now={now}
                
              />
            </Section>
          )}
      </div>
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-aqua-border bg-aqua-surface p-4">
      <div className="mb-2.5 flex items-center gap-1.5 text-aqua-text-muted">
        {icon}
        <h3 className="text-[10px] font-medium uppercase tracking-[0.12em]">{title}</h3>
      </div>
      <div className="space-y-1 text-xs">{children}</div>
    </div>
  );
}

function Row({
  k,
  v,
  valColor,
  detail,
}: {
  k: string;
  v: string;
  valColor?: string;
  detail?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-aqua-text-muted">{k}</span>
      <span className="text-right">
        <span
          className="font-tabular text-aqua-text"
          style={valColor ? { color: valColor } : undefined}
        >
          {v}
        </span>
        {detail && <span className="ml-1.5 text-[10px] text-aqua-text-muted">{detail}</span>}
      </span>
    </div>
  );
}

// Linha desabilitada: o valor depende de tópico que o firmware ainda não
// publica. Não simular — Popover documenta o que falta para popular.
function FirmwarePlaceholder({ label }: { label: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-aqua-text-muted">{label}</span>
      <span className="flex items-center gap-1.5">
        <span className="text-right text-[11px] italic text-aqua-text-muted/60">
          aguardando firmware
        </span>
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={`Por que ${label} aguarda firmware`}
              className="inline-flex h-4 w-4 items-center justify-center rounded text-aqua-text-muted/60 transition hover:text-aqua-accent focus:outline-none focus:ring-1 focus:ring-aqua-accent"
            >
              <Info className="h-3 w-3" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            side="left"
            align="center"
            className="w-72 border-aqua-border bg-aqua-surface text-xs leading-relaxed text-aqua-text"
          >
            Este dado depende de novo tópico{" "}
            <code className="rounded bg-black/40 px-1 py-0.5 text-[10px] text-aqua-accent">
              aquasense-ibmec/system/health
            </code>{" "}
            que ainda não é publicado pelo <code className="text-aqua-accent">main.py</code>. Quando
            o firmware for atualizado, este campo populará automaticamente.
          </PopoverContent>
        </Popover>
      </span>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-full border px-2.5 py-0.5 text-[11px] transition " +
        (active
          ? "border-aqua-accent bg-aqua-accent/15 text-aqua-accent"
          : "border-aqua-border text-aqua-text-muted hover:border-aqua-accent/40 hover:text-aqua-text")
      }
    >
      {children}
    </button>
  );
}

// v4.0 — conteúdo da seção "Controle de Dosagem". Read-only.
// Comandos ativos vivem em AdvancedControlPanel (aba Controle Avançado).
function ControlDosingContent({
  controlState,
  dosingEvents,
  health,
  now,
}: {
  controlState: import("@/types/firmware").ControlStateMessage | null;
  dosingEvents: import("@/types/firmware").DoseEvent[];
  health: import("@/types/firmware").SystemHealthMessage | null;
  now: number;
}) {
  // Doses 24h: fonte autoritativa = systemHealth.doses_today (firmware
  // mantém histórico real, nosso buffer FIFO de 50 só vê o que chega
  // depois do mount). "—" quando ainda não chegou primeira health (≤60s).
  const doses = health?.doses_today;

  const mode = controlState?.mode ?? null;
  const estop = controlState?.estop ?? false;
  const dose = controlState?.dose_in_progress ?? null;

  const modeColor =
    mode === "auto"
      ? "var(--status-ok)"
      : mode === "estop"
        ? "var(--status-crit)"
        : "var(--aqua-text-muted)";
  const modeLabel =
    mode === "auto" ? "AUTO" : mode === "manual" ? "MANUAL" : mode === "estop" ? "EMERGÊNCIA" : "—";

  const dosesLabel = doses
    ? `cloro ${doses.cloro} · ácido ${doses.acido} · base ${doses.base}`
    : "—";

  return (
    <>
      <Row k="Modo atual" v={modeLabel} valColor={modeColor} />
      <Row
        k="E-Stop"
        v={estop ? "ATIVO" : "OK"}
        valColor={estop ? "var(--status-crit)" : "var(--status-ok)"}
        detail={estop && controlState ? `desde ${formatRelative(now, controlState.t)}` : undefined}
      />
      <Row
        k="Dose em andamento"
        v={dose ? DOSE_LABEL[dose] : "nenhuma"}
        valColor={dose ? DOSE_COLOR[dose] : undefined}
      />
      <Row k="Doses (24h)" v={dosesLabel} detail={doses ? undefined : "aguardando system/health"} />

      {/* Eventos recentes — até 10 do array circular. */}
      {dosingEvents.length > 0 && (
        <div className="mt-2.5 border-t border-aqua-border/60 pt-2">
          <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-aqua-text-muted">
            Eventos recentes
          </div>
          <ul className="space-y-0.5 font-tabular text-[11px] leading-relaxed">
            {dosingEvents.slice(0, 10).map((e, i) => {
              const time = new Date(e.t).toLocaleTimeString("pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
              });
              const evColor =
                e.event === "blocked"
                  ? "var(--status-warn)"
                  : e.event === "completed"
                    ? "var(--status-ok)"
                    : "var(--aqua-text)";
              return (
                <li key={`${e.t}-${i}`} className="flex gap-2">
                  <span className="shrink-0 text-aqua-text-muted">{time}</span>
                  <span className="shrink-0" style={{ color: DOSE_COLOR[e.parameter] }}>
                    {e.parameter}
                  </span>
                  <span style={{ color: evColor }}>{e.event}</span>
                  {e.reason && <span className="truncate text-aqua-text-muted">· {e.reason}</span>}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Decisão arquitetural (revisada): comandos ativos vivem APENAS na
          aba "Controle Avançado". Esta seção é read-only. */}
    </>
  );
}
// Sub-blocos de comandos (CommandsBlock / DoseButton / CommandHistoryBlock)
// foram removidos: a aba Diagnóstico voltou a ser read-only. Comandos
// ativos vivem exclusivamente em AdvancedControlPanel (aba Controle Avançado),
// com padrão único de hold-to-confirm 1.5s.

