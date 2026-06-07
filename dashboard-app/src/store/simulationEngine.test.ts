import { describe, it, expect } from "vitest";
import { runSimulationTick } from "./simulationEngine";
import { usePoolStore } from "./poolStore";
import { SIM } from "@/lib/constants";

// O tick de simulação era inline no poolStore (dentro de setInterval) e não
// tinha cobertura. Agora é uma função pura `runSimulationTick(state) -> patch`,
// então dá para travar suas invariantes sem mexer no relógio nem no store.

describe("runSimulationTick", () => {
  it("devolve um patch consistente e avança o relógio da simulação em 5s", () => {
    const s = usePoolStore.getState();
    const patch = runSimulationTick(s);

    expect(typeof patch.ph).toBe("number");
    expect(Number.isFinite(patch.temp_piscina as number)).toBe(true);
    expect(Number.isFinite(patch.temp_coletor as number)).toBe(true);
    expect(patch.uptime_s).toBe(s.uptime_s + 5);
    expect(patch.lastTickAt).toBeGreaterThan(0);
    expect(typeof patch._cloudLeft).toBe("number");
  });

  it("respeita os limites dos buffers de histórico a cada tick", () => {
    const base = usePoolStore.getState();
    const patch = runSimulationTick(base);
    // liveHistory é sempre cortado para LIVE_HISTORY_MAX a cada tick.
    expect((patch.liveHistory ?? []).length).toBeLessThanOrEqual(SIM.LIVE_HISTORY_MAX);
    // history cresce no máximo 1 ponto por tick (e só quando passa HISTORY_STEP_MS).
    expect((patch.history ?? []).length).toBeLessThanOrEqual(base.history.length + 1);
  });

  it("corta o history em HISTORY_MAX quando um novo ponto entra", () => {
    const base = usePoolStore.getState();
    const last = base.history[base.history.length - 1];
    // Força um append: histórico acima do teto, com o último ponto bem no passado.
    const oversized = Array.from({ length: SIM.HISTORY_MAX + 50 }, () => ({ ...last, t: 1 }));
    const patch = runSimulationTick({ ...base, history: oversized });
    expect((patch.history ?? []).length).toBe(SIM.HISTORY_MAX);
  });

  it("é puro — não muta o estado de entrada", () => {
    const s = usePoolStore.getState();
    const beforePh = s.ph;
    const beforeLiveLen = s.liveHistory.length;
    const beforeAlertsLen = s.alerts.length;

    runSimulationTick(s);

    expect(s.ph).toBe(beforePh);
    expect(s.liveHistory.length).toBe(beforeLiveLen);
    expect(s.alerts.length).toBe(beforeAlertsLen);
  });

  it("acumula os contadores de sessão a partir do estado de entrada", () => {
    const s = { ...usePoolStore.getState(), sessionAlertsOpened: 5 };
    const patch = runSimulationTick(s);
    // O tick só soma (>= 5); nunca zera nem decrementa o contador de entrada.
    expect(patch.sessionAlertsOpened as number).toBeGreaterThanOrEqual(5);
  });
});
