// Detector de gaps na sequência de ciclos publicada pelo firmware.
//
// O ESP32 incrementa `cycle` a cada loop. Se o broker, a rede ou o próprio
// firmware perdem amostras, o cliente recebe (#1, #2, #5) — um buraco de 2.
// Este módulo é a contabilidade desses buracos.
//
// Decisões de design:
//   - Lógica pura (sem React, sem MQTT) para ser testável isoladamente.
//     O MqttProvider mantém uma instância em ref e empurra cada ciclo.
//   - Buffer FIFO de tamanho fixo: 50 gaps. Diagnóstico precisa do recente,
//     não do histórico completo — e cabe no estado do provider sem custo.
//   - Reset explícito ao trocar de `source`: ciclos do mock (fallback) e do
//     firmware vivem em sequências diferentes; a transição entre eles NÃO
//     é um gap real, é uma descontinuidade de origem.
//   - Cycle voltando atrás (firmware reiniciou) não conta como gap, mas
//     reseta o "último visto" para a nova base. Senão o próximo ciclo
//     pareceria um gap gigante negativo.
//   - Primeiro ciclo recebido (lastSeen === null) nunca conta — não temos
//     baseline para comparar.

export interface GapEvent {
  detected_at: number;
  from: number;
  to: number;
  missed: number;
}

export const GAP_BUFFER_MAX = 50;

export interface GapDetectorState {
  lastSeen: number | null;
  gaps: GapEvent[];
  totalGaps: number;
}

export function createGapDetector(): GapDetectorState {
  return { lastSeen: null, gaps: [], totalGaps: 0 };
}

// Processa um ciclo recebido. Retorna NOVO estado (imutável) — fácil de
// usar com setState do React e fácil de comparar em testes.
export function pushCycle(
  state: GapDetectorState,
  cycle: number,
  now: number = Date.now(),
): GapDetectorState {
  // Primeiro ciclo: define baseline, não há o que comparar.
  if (state.lastSeen === null) {
    return { ...state, lastSeen: cycle };
  }

  // Mesmo ciclo (republicação) — ignora silenciosamente.
  if (cycle === state.lastSeen) {
    return state;
  }

  // Ciclo voltou atrás → firmware reiniciou. Reseta baseline, sem gap.
  if (cycle < state.lastSeen) {
    return { ...state, lastSeen: cycle };
  }

  // Sequência consecutiva — sem gap.
  if (cycle === state.lastSeen + 1) {
    return { ...state, lastSeen: cycle };
  }

  // Gap real: cycle > lastSeen + 1.
  const gap: GapEvent = {
    detected_at: now,
    from: state.lastSeen,
    to: cycle,
    missed: cycle - state.lastSeen - 1,
  };
  const nextGaps = [...state.gaps, gap];
  // FIFO: descarta os mais antigos quando estoura o limite.
  const trimmed =
    nextGaps.length > GAP_BUFFER_MAX ? nextGaps.slice(nextGaps.length - GAP_BUFFER_MAX) : nextGaps;

  return {
    lastSeen: cycle,
    gaps: trimmed,
    totalGaps: state.totalGaps + 1,
  };
}

// Reseta o "último ciclo visto" preservando o histórico de gaps já registrados
// e o contador acumulado. Usado quando a fonte de dados muda (mqtt ↔ fallback)
// — a sequência de ciclos do mock não é comparável com a do firmware real.
export function resetBaseline(state: GapDetectorState): GapDetectorState {
  if (state.lastSeen === null) return state;
  return { ...state, lastSeen: null };
}
