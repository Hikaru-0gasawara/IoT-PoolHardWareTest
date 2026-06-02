import { useEffect } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { Wifi, WifiOff, Droplets, RefreshCw, Settings, Power } from "lucide-react";
import { usePoolStore } from "@/store/poolStore";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useNow } from "@/hooks/useNow";
import { useConnection, useControlState } from "@/hooks/useAquaSense";
import { statusColor, statusLabel } from "@/lib/thresholds";
import { describeMqttStatus } from "@/lib/mqttStatus";
import { cn } from "@/lib/utils";

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
  // FORK PT (Adição 2) — "atualizado há Xs · ciclo #N" no header.
  const cycleTxt = typeof conn.cycle === "number" ? ` · ciclo #${conn.cycle}` : "";
  const updatedFull = `atualizado ${updatedTxt}${cycleTxt}`;
  const mqttConnected = conn.status === "connected";
  // Diagnóstico unificado — mesma fonte que o card "Conexão MQTT" da página de
  // Configurações. O header só ESCALA visualmente em casos críticos (silent
  // = ESP32 mudo > 5min). Estados intermediários (stale 30s-5min) ficam só na
  // página de Configurações para evitar pânico por flap de rede.
  const mqttView = describeMqttStatus(conn.status, conn.source, conn.lastMessageAt, now);
  const mqttCritical = mqttView.tone === "crit" && mqttView.staleness === "silent";
  // Indicador discreto de fonte — informativo, nunca repete o estado da água.
  // Copy intencionalmente neutra: estados de conexão não devem soar dramáticos.
  // Cobertura de cases (ordem importa): mqtt real > erro de conexão >
  // conectando > fallback (mock local) > sem dados ainda. Nunca cai em
  // "iniciando…" depois que algum estado terminal foi atingido.
  let sourceLabel: string;
  if (conn.source === "mqtt") {
    sourceLabel = typeof conn.cycle === "number" ? `ao vivo · ciclo #${conn.cycle}` : "ao vivo";
  } else if (conn.status === "disconnected" || conn.status === "error") {
    sourceLabel = "sem conexão";
  } else if (conn.status === "connecting") {
    sourceLabel = "conectando…";
  } else if (conn.source === "fallback") {
    sourceLabel = "modo simulação";
  } else {
    // status=connected, source=none → broker OK mas ESP32 ainda não publicou.
    sourceLabel = "aguardando ESP32";
  }

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

          {/* Indicador discreto de fonte de dados — informativo, nunca alarmante. */}
          <div className="flex items-center gap-2 text-xs text-aqua-text-muted">
            {mqttConnected ? (
              <Wifi className="h-3.5 w-3.5 text-aqua-text-muted" aria-hidden />
            ) : (
              <WifiOff className="h-3.5 w-3.5 text-aqua-text-muted" aria-hidden />
            )}
            <span>{sourceLabel}</span>
            <span className="opacity-50" aria-hidden>·</span>
            <span className="font-tabular">{updatedTxt}</span>
          </div>
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
            className={cn(
              "ml-1 inline-flex h-11 w-11 items-center justify-center rounded-lg border transition-colors md:hidden",
              location.pathname.startsWith("/config")
                ? "border-aqua-accent/40 bg-aqua-accent/10 text-aqua-accent"
                : "border-aqua-border bg-aqua-surface text-aqua-text-muted hover:text-aqua-text",
            )}
          >
            <Settings className="h-5 w-5 md:h-4 md:w-4" />
          </Link>
        </div>
      </div>

      {/* Mobile status pill */}
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
          <div className="flex items-center gap-1.5 text-[11px] text-aqua-text-muted">
            {mqttConnected ? <Wifi className="h-3 w-3" aria-hidden /> : <WifiOff className="h-3 w-3" aria-hidden />}
            <span>{sourceLabel}</span>
          </div>
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
  const controlState = useControlState();
  const estopActive = controlState?.estop === true;
  // Banner secundário só aparece quando o sistema está em fallback E a água
  // está OK. Se já existe pílula crítica/atenção no header, não duplica ruído.
  const showFallbackBanner = conn.source === "fallback" && status === "ok";
  const handleReconnect = () => {
    if (typeof window !== "undefined") window.location.reload();
  };

  return (
    <div className="min-h-screen bg-aqua-bg text-aqua-text">
      <Header />
      {/* v4.0 — banner global de E-Stop. Categoria distinta do banner de
          fallback: aqui banhista pode estar em risco real, então persiste
          até estop voltar a false. NÃO bloqueia navegação — operador
          precisa continuar enxergando sensores para diagnosticar a causa. */}
      {estopActive && (
        <div
          role="alert"
          aria-live="assertive"
          className="flex items-center justify-center gap-3 border-b border-status-crit/40 bg-status-crit/15 px-4 py-2.5 text-sm text-status-crit"
        >
          <Power className="h-4 w-4 shrink-0" aria-hidden />
          <span className="font-medium">
            Sistema em emergência. Dosagem interrompida. Aguardando reset manual no painel físico.
          </span>
        </div>
      )}
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
