// Máquina de estado dos alertas agregados — extraída do poolStore.
//
// Funções PURAS (sem acesso ao store nem a side effects): recebem o array de
// alertas atual + as leituras do ciclo e devolvem o próximo array. A regra é
// "abre após 3 ciclos fora, resolve após 5 ciclos dentro", com shadows internos
// para contar os ciclos antes de abrir um alerta real. Ver detalhes em
// types/aquasense.ts.

import type { AggregatedAlert, ParameterKey } from "@/types/aquasense";
import { statusFor, THRESHOLDS } from "@/lib/thresholds";
import { POOL } from "@/lib/constants";

const RESOLVED_RETENTION_MS = 24 * 60 * 60 * 1000; // mantém resolvidos por 24h
const OPEN_AFTER_CYCLES = 3;
const RESOLVE_AFTER_CYCLES = 5;

export type ParamReading = { key: ParameterKey; value: number };

// Estatísticas de uma única passada do agregador. Acumuladas no store
// como contadores de sessão para a aba Diagnóstico.
//   - opened: quantos alertas REAIS abriram neste tick (shadow → ativo)
//   - escalations: quantos passaram de warn → crit (zera ack, conta uma vez)
//   - resolved: quantos transitaram de ativo → resolvido neste tick
// Tempo médio de resolução é calculado na UI a partir do array de alerts
// (resolvido_em - iniciado_em), portanto não precisa ser contador aqui.
export interface AggregatorTickStats {
  opened: number;
  escalations: number;
  resolved: number;
}

// Roda a máquina de estado dos alertas agregados a cada ciclo (≈5s).
// Versão "rica": devolve o array atualizado + estatísticas do tick.
// `processAggregatedAlerts` (abaixo) continua como wrapper devolvendo só
// o array, para call sites que não querem stats.
export function processAggregatedAlertsWithStats(
  current: AggregatedAlert[],
  readings: ParamReading[],
  now: number,
): { alerts: AggregatedAlert[]; stats: AggregatorTickStats } {
  const stats: AggregatorTickStats = { opened: 0, escalations: 0, resolved: 0 };
  // 1) descarta resolvidos antigos
  let next = current.filter(
    (a) =>
      a.status !== "resolvido" ||
      (a.resolvido_em != null && now - a.resolvido_em < RESOLVED_RETENTION_MS),
  );

  // index por parametro (no máximo 1 alerta REAL ativo por parametro;
  // shadows são pré-aberturas e não contam como alerta existente)
  const activeByParam = new Map<ParameterKey, AggregatedAlert>();
  next.forEach((a) => {
    if (a.status === "ativo" && !a.id.startsWith("shadow:")) activeByParam.set(a.parametro, a);
  });

  for (const { key, value } of readings) {
    const lvl = statusFor(key, value); // "ok" | "warn" | "crit"
    const t = THRESHOLDS[key];
    const existing = activeByParam.get(key);

    if (lvl === "ok") {
      // dentro da faixa
      if (existing) {
        const dentro = existing.ciclos_consecutivos_dentro + 1;
        const updated: AggregatedAlert = {
          ...existing,
          ciclos_consecutivos_dentro: dentro,
          ciclos_consecutivos_fora: 0,
          valor_atual: value,
          ultimo_update_t: now,
        };
        if (dentro >= RESOLVE_AFTER_CYCLES) {
          updated.status = "resolvido";
          updated.resolvido_em = now;
          activeByParam.delete(key);
          stats.resolved += 1;
        }
        next = next.map((a) => (a.id === existing.id ? updated : a));
      }
      continue;
    }

    // fora da faixa (warn | crit)
    if (!existing) {
      // candidato: procura registro "pré-aberto" (não criamos um — usamos um
      // contador efêmero embutido em um alerta com status=ativo apenas após
      // OPEN_AFTER_CYCLES). Para manter simples, criamos um shadow no array.
      const shadowId = `shadow:${key}`;
      const shadow = next.find((a) => a.id === shadowId);
      const fora = (shadow?.ciclos_consecutivos_fora ?? 0) + 1;
      if (fora >= OPEN_AFTER_CYCLES) {
        // abre alerta real
        const sev: "warn" | "crit" = lvl;
        const real: AggregatedAlert = {
          id: `${key}:${sev}:${now}`,
          parametro: key,
          severity: sev,
          severity_max: sev,
          status: "ativo",
          iniciado_em: now,
          ultimo_update_t: now,
          resolvido_em: null,
          ack_em: null,
          ciclos_consecutivos_fora: fora,
          ciclos_consecutivos_dentro: 0,
          ocorrencias: 1,
          valor_atual: value,
          valor_min: value,
          valor_max: value,
          faixa_ideal: { min: t.idealMin, max: t.idealMax },
          unidade: t.unit,
        };
        next = next.filter((a) => a.id !== shadowId);
        next = [real, ...next];
        activeByParam.set(key, real);
        stats.opened += 1;
      } else {
        // mantém/cria shadow contando ciclos
        const shadowAlert: AggregatedAlert = {
          id: shadowId,
          parametro: key,
          severity: lvl,
          severity_max: lvl,
          status: "ativo",
          iniciado_em: shadow?.iniciado_em ?? now,
          ultimo_update_t: now,
          resolvido_em: null,
          ack_em: null,
          ciclos_consecutivos_fora: fora,
          ciclos_consecutivos_dentro: 0,
          ocorrencias: 0,
          valor_atual: value,
          valor_min: Math.min(shadow?.valor_min ?? value, value),
          valor_max: Math.max(shadow?.valor_max ?? value, value),
          faixa_ideal: { min: t.idealMin, max: t.idealMax },
          unidade: t.unit,
        };
        next = shadow
          ? next.map((a) => (a.id === shadowId ? shadowAlert : a))
          : [shadowAlert, ...next];
      }
      continue;
    }

    // já existe alerta ativo — atualiza
    const escalou = existing.severity === "warn" && lvl === "crit";
    if (escalou) stats.escalations += 1;
    const updated: AggregatedAlert = {
      ...existing,
      severity: escalou ? "crit" : existing.severity, // não desescala
      severity_max: lvl === "crit" || existing.severity_max === "crit" ? "crit" : "warn",
      ack_em: escalou ? null : existing.ack_em, // escalação zera ack
      ciclos_consecutivos_fora: existing.ciclos_consecutivos_fora + 1,
      ciclos_consecutivos_dentro: 0,
      ocorrencias: existing.ocorrencias + 1,
      valor_atual: value,
      valor_min: Math.min(existing.valor_min, value),
      valor_max: Math.max(existing.valor_max, value),
      ultimo_update_t: now,
    };
    next = next.map((a) => (a.id === existing.id ? updated : a));
  }

  // remove shadows cujos parâmetros voltaram ao OK (não estão em readings fora)
  const foraParams = new Set(
    readings.filter((r) => statusFor(r.key, r.value) !== "ok").map((r) => r.key),
  );
  next = next.filter((a) => !a.id.startsWith("shadow:") || foraParams.has(a.parametro));

  // limita o array
  return { alerts: next.slice(0, POOL.ALERT_MAX), stats };
}

// Wrapper backward-compat: devolve só o array.
export function processAggregatedAlerts(
  current: AggregatedAlert[],
  readings: ParamReading[],
  now: number,
): AggregatedAlert[] {
  return processAggregatedAlertsWithStats(current, readings, now).alerts;
}
