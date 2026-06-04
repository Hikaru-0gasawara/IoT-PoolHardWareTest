// dosingGuards — camadas de segurança de software para dosagem manual.
//
// Centraliza as regras que decidem se uma dose pode ou não ser enviada,
// implementando as "camadas de segurança previstas" do roadmap:
//   1. E-Stop ativo            → bloqueia tudo (parada de emergência do firmware)
//   2. Modo de operação        → só dosa em "manual"
//   3. Sensor com erro         → leitura inválida bloqueia o parâmetro afetado
//   4. Dose em andamento       → uma dosadora por vez, nunca simultaneamente
//   5. Dead time               → intervalo mínimo entre doses do mesmo produto
//   6. Interlock pH/cloro      → não dosar ácido/base junto com cloro (gás tóxico)
//   7. Limite horário          → teto de doses por produto na última hora
//   8. Limite diário           → teto de doses por produto no dia
//
// É lógica pura (sem React/MQTT) para ser reutilizada por qualquer painel
// e testada isoladamente.

import type { DoseChemical } from "@/types/firmware";
import type { PumpMode } from "@/types/aquasense";

// Janelas e limites — valores conservadores para ambiente acadêmico.
export const DEAD_TIME_MS = 30 * 60_000; // 30 min entre doses do mesmo produto
export const INTERLOCK_MS = 5 * 60_000; // 5 min entre cloro e ácido/base
export const MAX_DOSES_PER_HOUR = 4; // por produto
export const MAX_DOSES_PER_DAY = 12; // por produto

export type DoseStamp = { chem: DoseChemical; t: number };

export interface DoseGuardContext {
  /** Produto que se deseja dosar */
  chem: DoseChemical;
  /** Telemetria real do ESP32 disponível */
  hasLiveFirmware: boolean;
  /** Modo de operação atual da bomba/sistema */
  modo: PumpMode;
  /** Parada de emergência ativa (E-Stop) */
  estopActive?: boolean;
  /** Sensor do parâmetro corrigido por esta dosadora está com erro */
  sensorError: boolean;
  /** Dose atualmente em envio/andamento (qualquer produto) */
  pendingDose?: DoseChemical | null;
  /** Última dose CONCLUÍDA por produto (epoch ms) */
  ultimaDosePorProduto: Record<DoseChemical, number | null>;
  /** Histórico de doses concluídas na sessão */
  doseTimestamps: ReadonlyArray<DoseStamp>;
  /** Instante de referência (epoch ms) */
  now: number;
}

const CHEM_LABEL: Record<DoseChemical, string> = {
  cloro: "cloro",
  acido: "ácido (pH−)",
  base: "base (pH+)",
};

function formatRemaining(ms: number): string {
  const totalMin = Math.ceil(ms / 60_000);
  if (totalMin < 60) return `${totalMin}min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

// Retorna o motivo do bloqueio, ou null se a dose está liberada.
// A ordem segue a hierarquia de segurança do roadmap (mais crítico primeiro).
export function reasonToBlockDose(ctx: DoseGuardContext): string | null {
  const {
    chem,
    hasLiveFirmware,
    modo,
    estopActive,
    sensorError,
    pendingDose,
    ultimaDosePorProduto,
    doseTimestamps,
    now,
  } = ctx;

  // 1. E-Stop ativo
  if (estopActive) return "Parada de emergência ativa — dosagem bloqueada";

  // Telemetria real obrigatória
  if (!hasLiveFirmware) return "Sem telemetria real do ESP32 — comandos bloqueados";

  // 2. Modo de operação
  if (modo === "automatico") return "Modo automático — troque para manual para dosar";

  // 3. Sensor com erro
  if (sensorError) {
    const param = chem === "cloro" ? "cloro" : "pH";
    return `Sensor de ${param} com erro — dose bloqueada`;
  }

  // 4. Dose em andamento — uma dosadora por vez
  if (pendingDose && pendingDose !== chem) {
    return `Dose de ${CHEM_LABEL[pendingDose]} em andamento — uma por vez`;
  }

  // 5. Dead time — intervalo mínimo entre doses do mesmo produto
  const last = ultimaDosePorProduto[chem];
  if (last != null) {
    const elapsed = now - last;
    if (elapsed < DEAD_TIME_MS) {
      return `Dead time — aguarde ${formatRemaining(DEAD_TIME_MS - elapsed)} antes de nova dose`;
    }
  }

  // 6. Interlock pH/cloro — não dosar ácido/base junto com cloro
  const counterparts: DoseChemical[] = chem === "cloro" ? ["acido", "base"] : ["cloro"];
  for (const other of counterparts) {
    const t = ultimaDosePorProduto[other];
    if (t != null && now - t < INTERLOCK_MS) {
      return `Interlock pH/cloro — aguarde ${formatRemaining(INTERLOCK_MS - (now - t))} após dose de ${CHEM_LABEL[other]}`;
    }
  }

  // 7. Limite horário (por produto)
  const lastHour = doseTimestamps.filter((d) => d.chem === chem && now - d.t < 60 * 60_000).length;
  if (lastHour >= MAX_DOSES_PER_HOUR) {
    return `Limite horário atingido (${MAX_DOSES_PER_HOUR}/h) para ${CHEM_LABEL[chem]}`;
  }

  // 8. Limite diário (por produto)
  const startOfDay = (() => {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  })();
  const today = doseTimestamps.filter((d) => d.chem === chem && d.t >= startOfDay).length;
  if (today >= MAX_DOSES_PER_DAY) {
    return `Limite diário atingido (${MAX_DOSES_PER_DAY}/dia) para ${CHEM_LABEL[chem]}`;
  }

  return null;
}
