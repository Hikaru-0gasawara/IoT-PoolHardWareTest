import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { FileDown } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { SolarSystemHero } from "@/components/editorial/SolarSystemHero";
import { WaterQualityCard } from "@/components/editorial/WaterQualityCard";
import { MqttLog } from "@/components/MqttLog";
import { exportDailyReport } from "@/lib/exportDailyReport";
import { ChlorineEventLog } from "@/components/ChlorineEventLog";
import { usePoolStore } from "@/store/poolStore";
import { useConnection } from "@/hooks/useAquaSense";
import { isSensorError } from "@/types/firmware";
import type { ParameterKey } from "@/types/aquasense";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AquaSense IoT — Monitor de piscina em tempo real" },
      { name: "description", content: "Dashboard interativo para monitoramento e controle de piscina aquecida via coletor solar. Sensores ESP32 + MQTT." },
      { property: "og:title", content: "AquaSense IoT — Monitor de piscina" },
      { property: "og:description", content: "Telemetria em tempo real: pH, ORP, condutividade, temperatura e controle automático da bomba." },
    ],
  }),
  component: HomePage,
});

// Mantém o cálculo de drift (vs ~1h atrás) próximo da fonte: a página é a
// dona da composição editorial, então deriva aqui e passa pronto pro card.
function useDiff(paramKey: ParameterKey): number {
  const history = usePoolStore((s) => s.history);
  const value = usePoolStore((s) => s[paramKey] as number);
  return useMemo(() => {
    const past = history[Math.max(0, history.length - 12)]?.[paramKey] as number | undefined;
    return past !== undefined ? value - past : 0;
  }, [history, paramKey, value]);
}

// Série recente (últimas ~N leituras válidas) para o mini-histórico do tile.
function useTrend(paramKey: ParameterKey, points = 12): number[] {
  const history = usePoolStore((s) => s.history);
  const value = usePoolStore((s) => s[paramKey] as number);
  return useMemo(() => {
    const recent = history
      .slice(-points)
      .map((p) => p[paramKey] as number)
      .filter((v) => typeof v === "number" && Number.isFinite(v) && v > -990);
    if (Number.isFinite(value) && value > -990) recent.push(value);
    return recent;
  }, [history, paramKey, value, points]);
}

function HomePage() {
  const ph = usePoolStore((s) => s.ph);
  const cloro = usePoolStore((s) => s.cloro);
  const alcalinidade = usePoolStore((s) => s.alcalinidade);
  const tempPool = usePoolStore((s) => s.temp_piscina);
  const tempSolar = usePoolStore((s) => s.temp_coletor);
  const deltaT = usePoolStore((s) => s.delta_t);
  const bombaOn = usePoolStore((s) => s.bomba_ligada);

  const conn = useConnection();

  // Loading = ainda não recebemos nenhuma mensagem MQTT e o store seguiu sua
  // semeadura inicial; mostramos placeholders nos cards principais.
  const loading = conn.source === "none" && conn.lastMessageAt === null;

  const phDiff = useDiff("ph");
  const cloroDiff = useDiff("cloro");
  const alcalinidadeDiff = useDiff("alcalinidade");
  const tempDiff = useDiff("temp_piscina");

  const phTrend = useTrend("ph");
  const cloroTrend = useTrend("cloro");
  const alcalinidadeTrend = useTrend("alcalinidade");
  const tempTrend = useTrend("temp_piscina");

  const heroEstado: "circulando" | "parada" | "emergencia" =
    bombaOn ? "circulando" : "parada";

  return (
    <AppShell>
      <div className="space-y-8 fade-up">
        <header className="flex items-end justify-between">
          <div>
            <h1 className="font-display text-4xl font-semibold tracking-tight text-aqua-text sm:text-5xl">
              Visão geral
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-aqua-text-muted">
              Cada ciclo do ESP32 chega via MQTT a cada 5 segundos. Leituras refletem o estado
              real da piscina — sensores, dosadoras e bomba operam de forma autônoma.
            </p>
          </div>
          <button
            type="button"
            onClick={() => exportDailyReport()}
            className="inline-flex shrink-0 items-center gap-2 rounded-full border border-aqua-border bg-aqua-surface px-4 py-2 text-sm font-medium text-aqua-text transition-colors hover:border-aqua-accent hover:text-aqua-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aqua-accent"
          >
            <FileDown className="h-4 w-4" aria-hidden />
            Exportar PDF
          </button>
        </header>

        <SolarSystemHero
          tempPiscina={tempPool}
          tempColetor={tempSolar}
          deltaT={deltaT}
          bombaOn={bombaOn}
          estado={heroEstado}
        />

        <section aria-labelledby="qualidade-heading" className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 id="qualidade-heading" className="font-display text-xl font-semibold tracking-tight text-aqua-text">
              Qualidade da água
            </h2>
            <p className="text-xs text-aqua-text-muted">Faixas do firmware v2.3</p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <WaterQualityCard
              paramKey="ph"
              value={ph}
              diff={phDiff}
              trend={phTrend}
              sensorError={isSensorError(ph)}
              dosing={false}
              estopActive={false}
              loading={loading}
            />
            <WaterQualityCard
              paramKey="cloro"
              value={cloro}
              diff={cloroDiff}
              trend={cloroTrend}
              sensorError={isSensorError(cloro)}
              dosing={false}
              estopActive={false}
              loading={loading}
            />
            <WaterQualityCard
              paramKey="alcalinidade"
              value={alcalinidade}
              diff={alcalinidadeDiff}
              trend={alcalinidadeTrend}
              sensorError={isSensorError(alcalinidade)}
              dosing={false}
              estopActive={false}
              loading={loading}
            />
            <WaterQualityCard
              paramKey="temp_piscina"
              value={tempPool}
              diff={tempDiff}
              trend={tempTrend}
              sensorError={isSensorError(tempPool)}
              dosing={false}
              estopActive={false}
              loading={loading}
            />
          </div>
        </section>

        <ChlorineEventLog />

        <MqttLog />
      </div>
    </AppShell>
  );
}
