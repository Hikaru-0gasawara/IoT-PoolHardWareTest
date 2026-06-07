// Detecção de cruzamento de faixa do Cloro — extraída do poolStore.
//
// Função PURA: compara duas leituras consecutivas de cloro e devolve um
// ChemEvent quando a leitura ENTRA ou SAI da faixa ideal (1.0–3.0 ppm), ou
// `null` quando não há transição relevante. Usada tanto na ingestão MQTT
// quanto no tick de simulação.

import type { ChemEvent } from "@/types/aquasense";
import { isSensorError } from "@/types/firmware";
import { statusFor, THRESHOLDS } from "@/lib/thresholds";

export function detectChlorineEvent(prev: number, cur: number, now: number): ChemEvent | null {
  if (isSensorError(prev) || isSensorError(cur)) return null;
  const prevStatus = statusFor("cloro", prev);
  const curStatus = statusFor("cloro", cur);
  const prevOk = prevStatus === "ok";
  const curOk = curStatus === "ok";
  if (prevOk === curOk) return null; // sem cruzamento de faixa
  const t = THRESHOLDS.cloro;
  const direcao: "baixo" | "alto" | "ideal" = curOk ? "ideal" : cur < t.idealMin ? "baixo" : "alto";
  return {
    t: now,
    parametro: "cloro",
    tipo: curOk ? "entrou_faixa" : "saiu_faixa",
    direcao,
    valor: cur,
    severity: curStatus,
  };
}
