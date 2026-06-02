import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { SolarSystemHero } from "@/components/editorial/SolarSystemHero";
import { WaterQualityCard } from "@/components/editorial/WaterQualityCard";
import { DosesLast24hCard } from "@/components/editorial/DosesLast24hCard";
import { ModeCard } from "@/components/editorial/ModeCard";
import { MqttLog } from "@/components/MqttLog";
import { usePoolStore } from "@/store/poolStore";
import {
  useConnection,
  useControlState,
  useDoseInProgress,
  useDosingEvents,
} from "@/hooks/useAquaSense";
import { isSensorError } from "@/types/firmware";
import type { ParameterKey } from "@/types/aquasense";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AquaSense IoT — Monitor de piscina em tempo real" },
      { name: "description", content: "Dashboard interativo para monitoramento e controle de piscina aquecida via coletor solar. Sensores ESP32 + MQTT." },
      { property: "og:title", content: "AquaSense IoT — Monitor de piscina" },
      { property: "og:description", content: "Telemetria em tempo real: pH, cloro, alcalinidade, temperatura e controle automático da bomba." },
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

function HomePage() {
  const ph = usePoolStore((s) => s.ph);
  const cloro = usePoolStore((s) => s.cloro);
  const alc = usePoolStore((s) => s.alcalinidade);
  const tempPool = usePoolStore((s) => s.temp_piscina);
  const tempSolar = usePoolStore((s) => s.temp_coletor);
  const deltaT = usePoolStore((s) => s.delta_t);
  const bombaOn = usePoolStore((s) => s.bomba_ligada);
  const cloroEmErro = usePoolStore((s) => s.cloroEmErro);

  const conn = useConnection();
  const controlState = useControlState();
  const dose = useDoseInProgress();
  const events = useDosingEvents();

  // Loading = ainda não recebemos nenhuma mensagem MQTT e o store seguiu sua
  // semeadura inicial; mostramos placeholders nos cards principais.
  const loading = conn.source === "none" && conn.lastMessageAt === null;
  const estopActive = controlState?.estop === true;

  const phDiff = useDiff("ph");
  const cloroDiff = useDiff("cloro");
  const alcDiff = useDiff("alcalinidade");
  const tempDiff = useDiff("temp_piscina");

  const heroEstado: "circulando" | "parada" | "emergencia" =
    estopActive ? "emergencia" : bombaOn ? "circulando" : "parada";

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
            <p className="text-xs text-aqua-text-muted">Faixas ABNT NBR 10818</p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <WaterQualityCard
              paramKey="ph"
              value={ph}
              diff={phDiff}
              sensorError={isSensorError(ph)}
              dosing={dose === "acido" || dose === "base"}
              estopActive={estopActive}
              loading={loading}
            />
            <WaterQualityCard
              paramKey="cloro"
              value={cloro}
              diff={cloroDiff}
              sensorError={cloroEmErro || isSensorError(cloro)}
              dosing={dose === "cloro"}
              estopActive={estopActive}
              loading={loading}
            />
            <WaterQualityCard
              paramKey="alcalinidade"
              value={alc}
              diff={alcDiff}
              sensorError={isSensorError(alc)}
              dosing={false}
              estopActive={estopActive}
              loading={loading}
            />
            <WaterQualityCard
              paramKey="temp_piscina"
              value={tempPool}
              diff={tempDiff}
              sensorError={isSensorError(tempPool)}
              dosing={false}
              estopActive={estopActive}
              loading={loading}
            />
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-[1.2fr_1fr]">
          <DosesLast24hCard events={events} dosingNow={dose} estopActive={estopActive} loading={loading} />
          <ModeCard mode={controlState?.mode ?? null} estopActive={estopActive} loading={loading} />
        </section>

        <MqttLog />
      </div>
    </AppShell>
  );
}
