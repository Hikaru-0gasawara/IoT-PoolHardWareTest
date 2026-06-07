import { describe, it, expect } from "vitest";
import { processAggregatedAlertsWithStats, type ParamReading } from "./alertEngine";
import type { AggregatedAlert, ParameterKey } from "@/types/aquasense";

// Foco: contadores `opened`, `escalations`, `resolved` retornados pelo
// agregador. Os cenários são desenhados para isolar UMA transição por vez.
//
// Faixas (THRESHOLDS) usadas:
//   pH ideal 7.2–7.6, warn 7.0–7.8 → fora de [7.0,7.8] = crit, fora de
//   [7.2,7.6] mas dentro de [7.0,7.8] = warn.
// Valores escolhidos:
//   7.4 = ok | 7.7 = warn (entre 7.6 e 7.8) | 7.85 = crit (acima de 7.8)
// Abertura: 3 ciclos consecutivos fora. Resolução: 5 ciclos dentro.

const PH: ParameterKey = "ph";
const reading = (value: number): ParamReading[] => [{ key: PH, value }];

function runCycles(
  initial: AggregatedAlert[],
  values: number[],
  startT = 1000,
): {
  alerts: AggregatedAlert[];
  totalOpened: number;
  totalEscalations: number;
  totalResolved: number;
} {
  let alerts = initial;
  let totalOpened = 0;
  let totalEscalations = 0;
  let totalResolved = 0;
  values.forEach((v, i) => {
    const r = processAggregatedAlertsWithStats(alerts, reading(v), startT + i * 1000);
    alerts = r.alerts;
    totalOpened += r.stats.opened;
    totalEscalations += r.stats.escalations;
    totalResolved += r.stats.resolved;
  });
  return { alerts, totalOpened, totalEscalations, totalResolved };
}

describe("processAggregatedAlertsWithStats — contadores de sessão", () => {
  it("opened incrementa no ciclo em que shadow vira alerta real (após 3 ciclos fora)", () => {
    const r = runCycles([], [7.7, 7.7, 7.7]); // 3× warn
    expect(r.totalOpened).toBe(1);
    expect(r.totalEscalations).toBe(0);
    expect(r.totalResolved).toBe(0);
    expect(r.alerts.filter((a) => !a.id.startsWith("shadow:"))).toHaveLength(1);
  });

  it("escalations incrementa SÓ na transição warn → crit (não a cada ciclo crit)", () => {
    // 3× warn → abre como warn. Depois 3× crit → escala UMA vez.
    const r = runCycles([], [7.7, 7.7, 7.7, 7.85, 7.85, 7.85]);
    expect(r.totalOpened).toBe(1);
    expect(r.totalEscalations).toBe(1); // crítico: NÃO conta 3 vezes
    expect(r.totalResolved).toBe(0);
    const real = r.alerts.find((a) => !a.id.startsWith("shadow:"));
    expect(real?.severity).toBe("crit");
  });

  it("escalations NÃO incrementa quando alerta abre direto como crit", () => {
    // 3× crit consecutivos → abre direto como crit, sem transição.
    const r = runCycles([], [7.85, 7.85, 7.85]);
    expect(r.totalOpened).toBe(1);
    expect(r.totalEscalations).toBe(0);
    const real = r.alerts.find((a) => !a.id.startsWith("shadow:"));
    expect(real?.severity).toBe("crit");
  });

  it("escalations NÃO incrementa quando crit volta para warn (sem desescalar severity)", () => {
    // Abre warn, escala para crit, depois recebe valor warn — severity
    // não desce e o contador não é decrementado nem reincrementado.
    const r = runCycles([], [7.7, 7.7, 7.7, 7.85, 7.85, 7.85, 7.7, 7.7]);
    expect(r.totalEscalations).toBe(1);
  });

  it("resolved incrementa no ciclo em que ativo → resolvido (após 5 dentro)", () => {
    // Abre warn (3 ciclos fora), depois 5 ciclos dentro da faixa ideal.
    const r = runCycles([], [7.7, 7.7, 7.7, 7.4, 7.4, 7.4, 7.4, 7.4]);
    expect(r.totalOpened).toBe(1);
    expect(r.totalResolved).toBe(1);
    const real = r.alerts.find((a) => !a.id.startsWith("shadow:"));
    expect(real?.status).toBe("resolvido");
  });

  it("nenhum contador incrementa em sequência tudo-OK (sem alerta)", () => {
    const r = runCycles([], [7.4, 7.4, 7.4, 7.4, 7.4]);
    expect(r.totalOpened).toBe(0);
    expect(r.totalEscalations).toBe(0);
    expect(r.totalResolved).toBe(0);
  });

  it("shadow virando OK antes de abrir não conta como opened", () => {
    // 2 ciclos fora (só shadow, ainda não abriu) → 1 ciclo dentro → shadow some.
    const r = runCycles([], [7.7, 7.7, 7.4]);
    expect(r.totalOpened).toBe(0);
    expect(r.alerts.filter((a) => !a.id.startsWith("shadow:"))).toHaveLength(0);
  });
});
