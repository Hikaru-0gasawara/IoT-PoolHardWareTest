import { describe, it, expect } from "vitest";
import { createGapDetector, pushCycle, resetBaseline, GAP_BUFFER_MAX } from "./cycleGaps";

describe("cycleGaps", () => {
  it("a) sequência consecutiva (#1,#2,#3) → 0 gaps", () => {
    let s = createGapDetector();
    s = pushCycle(s, 1, 1000);
    s = pushCycle(s, 2, 2000);
    s = pushCycle(s, 3, 3000);
    expect(s.gaps).toHaveLength(0);
    expect(s.totalGaps).toBe(0);
    expect(s.lastSeen).toBe(3);
  });

  it("b) gap simples (#1,#2,#5) → 1 gap registrado com missed=2", () => {
    let s = createGapDetector();
    s = pushCycle(s, 1, 1000);
    s = pushCycle(s, 2, 2000);
    s = pushCycle(s, 5, 3000);
    expect(s.gaps).toHaveLength(1);
    expect(s.gaps[0]).toEqual({
      detected_at: 3000,
      from: 2,
      to: 5,
      missed: 2,
    });
    expect(s.totalGaps).toBe(1);
    expect(s.lastSeen).toBe(5);
  });

  it("c) múltiplos gaps acumulam até 50, depois descarta mais antigos (FIFO)", () => {
    let s = createGapDetector();
    s = pushCycle(s, 0, 0);
    // Cria 60 gaps: cada par (k, k+2) gera 1 gap com missed=1.
    for (let i = 0; i < 60; i++) {
      const next = s.lastSeen! + 2;
      s = pushCycle(s, next, 1000 + i);
    }
    expect(s.gaps).toHaveLength(GAP_BUFFER_MAX);
    expect(s.totalGaps).toBe(60);
    // Os 10 primeiros foram descartados — o gap mais antigo retido é o 11º (índice 10).
    // detected_at do 11º push = 1000 + 10 = 1010.
    expect(s.gaps[0].detected_at).toBe(1010);
    // O mais recente é o último (60º push = 1000 + 59 = 1059).
    expect(s.gaps[s.gaps.length - 1].detected_at).toBe(1059);
  });

  it("d) reset ao trocar de source: fallback #100,#101 → mqtt #5 não conta como gap", () => {
    let s = createGapDetector();
    // Mock (fallback) emitindo ciclos altos
    s = pushCycle(s, 100, 1000);
    s = pushCycle(s, 101, 2000);
    expect(s.gaps).toHaveLength(0);
    // Source muda → reset do baseline (gaps históricos preservados)
    s = resetBaseline(s);
    expect(s.lastSeen).toBeNull();
    // Firmware real recomeça em #5 — não é gap, é troca de origem
    s = pushCycle(s, 5, 3000);
    expect(s.gaps).toHaveLength(0);
    expect(s.totalGaps).toBe(0);
    expect(s.lastSeen).toBe(5);
  });

  it("e) cycle voltando atrás (firmware reiniciou) → não conta como gap, reseta lastSeen", () => {
    let s = createGapDetector();
    s = pushCycle(s, 100, 1000);
    s = pushCycle(s, 101, 2000);
    s = pushCycle(s, 1, 3000); // reboot
    expect(s.gaps).toHaveLength(0);
    expect(s.totalGaps).toBe(0);
    expect(s.lastSeen).toBe(1);
    // E sequência subsequente continua sendo monitorada normalmente
    s = pushCycle(s, 4, 4000);
    expect(s.gaps).toHaveLength(1);
    expect(s.gaps[0].missed).toBe(2);
  });

  it("f) primeiro ciclo (lastSeen === null) → não conta como gap", () => {
    let s = createGapDetector();
    expect(s.lastSeen).toBeNull();
    s = pushCycle(s, 999, 1000);
    expect(s.gaps).toHaveLength(0);
    expect(s.totalGaps).toBe(0);
    expect(s.lastSeen).toBe(999);
  });

  it("ciclo repetido é ignorado (republicação do broker)", () => {
    let s = createGapDetector();
    s = pushCycle(s, 5, 1000);
    s = pushCycle(s, 5, 2000);
    expect(s.lastSeen).toBe(5);
    expect(s.gaps).toHaveLength(0);
  });

  it("resetBaseline em estado vazio é no-op", () => {
    const s = createGapDetector();
    expect(resetBaseline(s)).toBe(s);
  });
});
