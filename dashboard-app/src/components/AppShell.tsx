import { useEffect } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { Droplets, RefreshCw, Settings } from "lucide-react";
import { usePoolStore } from "@/store/poolStore";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useNow } from "@/hooks/useNow";
import { useConnection } from "@/hooks/useAquaSense";
import { statusColor, statusLabel } from "@/lib/thresholds";
import { describeMqttStatus, toneToColor } from "@/lib/mqttStatus";
import { cn } from "@/lib/utils";

interface MqttStatusPillProps {
  conn: ReturnType<typeof useConnection>;
  now: number;
  updatedTxt: string;
  mobile?: boolean;
}

function MqttStatusPill({ conn, now, updatedTxt, mobile }: MqttStatusPillProps) {
  const view = describeMqttStatus(conn.status, conn.source, conn.lastMessageAt, now);
  const color = toneToColor(view.tone);
  const isLive = conn.source === "mqtt" && view.staleness === "fresh";
  const isRetained = conn.source === "mqtt" && (view.staleness === "stale" || view.staleness === "recent");

  let label = view.label;
  if (conn.source === "mqtt" && typeof conn.cycle === "number") {
    label = isRetained ? `Retido · ciclo #${conn.cycle}` : `Ao vivo · ciclo #${conn.cycle}`;
  } else if (conn.source === "mqtt") {
    label = isRetained ? "Retido" : "Ao vivo";
  }

  const dotSize = mobile ? "h-1.5 w-1.5" : "h-2 w-2";
  const textSize = mobile ? "text-[11px]" : "text-xs";
  const padding = mobile ? "px-2 py-0.5" : "px-2.5 py-1";

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border",
        padding,
        textSize,
      )}
      style={{
        borderColor: `color-mix(in oklab, ${color} 35%, transparent)`,
        backgroundColor: `color-mix(in oklab, ${color} 10%, transparent)`,
        color,
      }}
      title={view.sublabel ?? label}
      aria-label={`MQTT: ${label}${view.sublabel ? ` — ${view.sublabel}` : ""}`}
    >
      <span
        className={cn("rounded-full", dotSize, isLive ? "aqua-pulse" : "")}
        style={{ backgroundColor: color }}
        aria-hidden
      />
      <span className="font-medium">{label}</span>
      {!mobile && (
        <>
          <span className="opacity-40" aria-hidden>·</span>
          <span className="font-tabular opacity-80">{updatedTxt}</span>
        </>
      )}
    </div>
  );
}

const NAV = [
  { to: "/", label: "Visão Geral" },
  { to: "/graficos", label: "Gráficos" },
  { to: "/controle", label: "Aquecimento" },
  { to: "/alertas", label: "Alertas" },
  { to: "/config", label: "Configurações" },
] as const;

export function Header() {
  const status = usePoolStore((s) => s.status_geral);
  const last = usePoolStore((s) => s.ultima_atualizacao_t);
  const conn = useConnection();
  const now = useNow(1000);
  const location = useLocation();

  const seconds = Math.max(0, Math.floor((now - last) / 1000));
  const updatedTxt = seconds < 5 ? "agora mesmo" : `há ${seconds}s`;
  const mqttView = describeMqttStatus(conn.status, conn.source, conn.lastMessageAt, now);
  const mqttCritical = mqttView.tone === "crit" && mqttView.staleness === "silent";

  // Hierarquia de alarme (água > sistema): só mostra a pílula central quando há
  // problema de água OU silêncio crítico do ESP32. "fallback MQTT" e "stale"
  // não são Ação Necessária — vão para o banner / página de Configurações.
  const showStatusPill = status !== "ok";
  const showMqttCritPill = !showStatusPill && mqttCritical;

  return (
    <header className="sticky top-0 z-40 border-b border-aqua-border bg-aqua-bg/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2.5 group">
          <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-aqua-primary to-aqua-accent shadow-glow-accent">
            <Droplets className="h-5 w-5 text-white" strokeWidth={2.5} />
          </div>
          <div className="leading-tight">
            <div className="font-semibold tracking-tight text-aqua-text">AquaSense</div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-aqua-text-muted">IoT · Pool monitor</div>
          </div>
        </Link>

        {/* System bar — uma única verdade. Pílula só aparece se água NÃO está OK. */}
        <div className="hidden items-center gap-3 md:flex">
          {showStatusPill && (
            <div
              className="flex items-center gap-2 rounded-full border px-3.5 py-1.5"
              style={{
                borderColor: statusColor(status),
                backgroundColor: `color-mix(in oklab, ${statusColor(status)} 15%, transparent)`,
              }}
              role="status"
              aria-live="polite"
            >
              <span
                className="h-2 w-2 rounded-full aqua-pulse"
                style={{ backgroundColor: statusColor(status) }}
                aria-hidden
              />
              <span className="text-sm font-medium" style={{ color: statusColor(status) }}>
                {statusLabel(status)}
              </span>
            </div>
          )}
          {showMqttCritPill && (
            <div
              className="flex items-center gap-2 rounded-full border px-3.5 py-1.5"
              style={{
                borderColor: "var(--status-crit)",
                backgroundColor: "color-mix(in oklab, var(--status-crit) 15%, transparent)",
              }}
              role="status"
              aria-live="polite"
            >
              <span className="h-2 w-2 rounded-full aqua-pulse" style={{ backgroundColor: "var(--status-crit)" }} aria-hidden />
              <span className="text-sm font-medium" style={{ color: "var(--status-crit)" }}>
                ESP32 sem resposta
              </span>
            </div>
          )}

          {/* Indicador visível de status MQTT — sempre presente para confirmar
              que o dashboard está recebendo atualizações (retidas ou ao vivo). */}
          <MqttStatusPill conn={conn} now={now} updatedTxt={updatedTxt} />
        </div>

        {/* Desktop nav + theme toggle */}
        <div className="flex items-center gap-1">
          <nav className="mr-2 hidden items-center gap-1 lg:flex">
            {NAV.map((item) => {
              const active = location.pathname === item.to;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  data-testid={`nav-link-${item.to === "/" ? "home" : item.to.slice(1)}`}
                  data-active={active ? "true" : "false"}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-sm transition-colors",
                    active ? "bg-aqua-surface-2 text-aqua-text" : "text-aqua-text-muted hover:text-aqua-text",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <ThemeToggle />

          {/* Engrenagem — sempre visível (mobile + desktop). Em mobile cumpre
              papel de acesso a /config (sem nav lateral); em desktop reforça
              affordance e dá feedback de rota ativa. */}
          <Link
            to="/config"
            aria-label="Abrir configurações"
            title="Configurações"
            data-testid="gear-config"
            data-active={location.pathname.startsWith("/config") ? "true" : "false"}
            className={cn(
              "ml-1 inline-flex h-11 w-11 items-center justify-center rounded-lg border transition-colors lg:hidden",
              location.pathname.startsWith("/config")
                ? "border-aqua-accent/40 bg-aqua-accent/10 text-aqua-accent"
                : "border-aqua-border bg-aqua-surface text-aqua-text-muted hover:text-aqua-text",
            )}
          >
            <Settings className="h-5 w-5 lg:h-4 lg:w-4" />
          </Link>
        </div>
      </div>

      {/* Mobile status bar */}
      <div className="flex items-center justify-between border-t border-aqua-border px-4 py-2 md:hidden">
        {showStatusPill ? (
          <div
            className="flex items-center gap-2 rounded-full border px-3 py-1"
            style={{
              borderColor: statusColor(status),
              backgroundColor: `color-mix(in oklab, ${statusColor(status)} 15%, transparent)`,
            }}
          >
            <span className="h-1.5 w-1.5 rounded-full aqua-pulse" style={{ backgroundColor: statusColor(status) }} aria-hidden />
            <span className="text-xs font-medium" style={{ color: statusColor(status) }}>{statusLabel(status)}</span>
          </div>
        ) : showMqttCritPill ? (
          <div
            className="flex items-center gap-2 rounded-full border px-3 py-1"
            style={{ borderColor: "var(--status-crit)", backgroundColor: "color-mix(in oklab, var(--status-crit) 15%, transparent)" }}
          >
            <span className="h-1.5 w-1.5 rounded-full aqua-pulse" style={{ backgroundColor: "var(--status-crit)" }} aria-hidden />
            <span className="text-xs font-medium" style={{ color: "var(--status-crit)" }}>ESP32 sem resposta</span>
          </div>
        ) : (
          <MqttStatusPill conn={conn} now={now} updatedTxt={updatedTxt} mobile />
        )}
        <div className="text-[10px] text-aqua-text-muted font-tabular">{updatedTxt}</div>
      </div>
    </header>
  );
}

export function MobileTabBar() {
  const location = useLocation();
  const items = [
    { to: "/", label: "Home", icon: "◐" },
    { to: "/graficos", label: "Gráficos", icon: "≋" },
    { to: "/controle", label: "Aquecim.", icon: "⚙" },
    { to: "/alertas", label: "Alertas", icon: "!" },
  ] as const;
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-aqua-border bg-aqua-surface/95 backdrop-blur-xl lg:hidden">
      <div className="mx-auto flex max-w-md items-center justify-around px-2 py-2">
        {items.map((it) => {
          const active = location.pathname === it.to;
          return (
            <Link
              key={it.to}
              to={it.to}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 rounded-lg py-1.5 text-[10px] transition-colors",
                active ? "text-aqua-accent" : "text-aqua-text-muted",
              )}
            >
              <span className="text-lg leading-none">{it.icon}</span>
              <span>{it.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  useEffect(() => { usePoolStore.getState()._start(); }, []);
  const conn = useConnection();
  const status = usePoolStore((s) => s.status_geral);
  // Banner secundário só aparece quando o sistema está em fallback E a água
  // está OK. Se já existe pílula crítica/atenção no header, não duplica ruído.
  const showFallbackBanner = conn.source === "fallback" && status === "ok";
  const handleReconnect = () => {
    if (typeof window !== "undefined") window.location.reload();
  };

  return (
    <div className="min-h-screen bg-aqua-bg text-aqua-text">
      <Header />

      {showFallbackBanner && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center justify-center gap-3 border-b border-status-warn/30 bg-status-warn/10 px-4 py-2 text-xs text-status-warn"
        >
          <span>
            Sem conexão com o ESP32 — exibindo simulação local. Os valores voltam ao normal quando o broker responder.
          </span>
          <button
            type="button"
            onClick={handleReconnect}
            className="inline-flex items-center gap-1 rounded-md border border-status-warn/40 bg-status-warn/10 px-2 py-0.5 font-medium text-status-warn hover:bg-status-warn/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-status-warn"
          >
            <RefreshCw className="h-3 w-3" aria-hidden /> Tentar reconectar
          </button>
        </div>
      )}
      <main className="mx-auto max-w-[1400px] px-4 pb-24 pt-6 sm:px-6 lg:pb-10">
        {children}
      </main>
      <MobileTabBar />
    </div>
  );
}
