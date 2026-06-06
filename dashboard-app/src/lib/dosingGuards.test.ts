import { describe, it, expect } from "vitest";
import {
  reasonToBlockDose,
  DEAD_TIME_MS,
  INTERLOCK_MS,
  MAX_DOSES_PER_HOUR,
  MAX_DOSES_PER_DAY,
  type DoseGuardContext,
} from "@/lib/dosingGuards";

const NOW = 1_700_000_000_000; // fixed epoch ms for deterministic tests

const BASE: DoseGuardContext = {
  chem: "cloro",
  hasLiveFirmware: true,
  modo: "manual",
  estopActive: false,
  sensorError: false,
  pendingDose: null,
  ultimaDosePorProduto: { cloro: null, acido: null, base: null },
  doseTimestamps: [],
  now: NOW,
};

describe("reasonToBlockDose — caminho feliz", () => {
  it("retorna null quando todas as condições estão ok", () => {
    expect(reasonToBlockDose(BASE)).toBeNull();
  });

  it("retorna null para acido em modo manual sem histórico", () => {
    expect(reasonToBlockDose({ ...BASE, chem: "acido" })).toBeNull();
  });

  it("retorna null para base em modo manual sem histórico", () => {
    expect(reasonToBlockDose({ ...BASE, chem: "base" })).toBeNull();
  });
});

describe("reasonToBlockDose — E-Stop (prioridade máxima)", () => {
  it("bloqueia com E-Stop ativo mesmo em modo manual", () => {
    const r = reasonToBlockDose({ ...BASE, estopActive: true });
    expect(r).toMatch(/parada de emergência/i);
  });

  it("E-Stop tem prioridade sobre ausência de firmware", () => {
    const r = reasonToBlockDose({ ...BASE, estopActive: true, hasLiveFirmware: false });
    expect(r).toMatch(/parada de emergência/i);
  });
});

describe("reasonToBlockDose — telemetria", () => {
  it("bloqueia sem telemetria real do firmware", () => {
    const r = reasonToBlockDose({ ...BASE, hasLiveFirmware: false });
    expect(r).toMatch(/sem telemetria/i);
  });
});

describe("reasonToBlockDose — modo de operação", () => {
  it("bloqueia em modo parado", () => {
    const r = reasonToBlockDose({ ...BASE, modo: "parado" });
    expect(r).not.toBeNull();
    expect(r).toMatch(/parada|parado/i);
  });

  it("bloqueia em modo automatico", () => {
    const r = reasonToBlockDose({ ...BASE, modo: "automatico" });
    expect(r).toMatch(/manual/i);
  });
});

describe("reasonToBlockDose — erro de sensor", () => {
  it("bloqueia quando sensor está com erro", () => {
    const r = reasonToBlockDose({ ...BASE, sensorError: true });
    expect(r).toMatch(/sensor/i);
  });
});

describe("reasonToBlockDose — dose em andamento", () => {
  it("bloqueia quando outra dose está em andamento", () => {
    const r = reasonToBlockDose({ ...BASE, chem: "cloro", pendingDose: "acido" });
    expect(r).toMatch(/andamento/i);
  });

  it("não bloqueia quando pendingDose é do mesmo produto", () => {
    // Mesmo produto em andamento é ignorado — o botão fica em loading via prop
    const r = reasonToBlockDose({ ...BASE, chem: "cloro", pendingDose: "cloro" });
    expect(r).toBeNull();
  });

  it("bloqueia base com acido em andamento", () => {
    const r = reasonToBlockDose({ ...BASE, chem: "base", pendingDose: "acido" });
    expect(r).toMatch(/andamento/i);
  });
});

describe("reasonToBlockDose — dead time", () => {
  it("bloqueia dentro do dead time (30 min)", () => {
    const last = NOW - DEAD_TIME_MS + 60_000; // 1 min antes do fim do dead time
    const r = reasonToBlockDose({
      ...BASE,
      ultimaDosePorProduto: { cloro: last, acido: null, base: null },
    });
    expect(r).toMatch(/dead time/i);
  });

  it("libera imediatamente após dead time expirar", () => {
    const last = NOW - DEAD_TIME_MS - 1;
    const r = reasonToBlockDose({
      ...BASE,
      ultimaDosePorProduto: { cloro: last, acido: null, base: null },
    });
    expect(r).toBeNull();
  });

  it("dead time é independente por produto (acido não afeta cloro)", () => {
    const last = NOW - DEAD_TIME_MS + 60_000; // acido dentro do dead time
    const r = reasonToBlockDose({
      ...BASE,
      chem: "cloro",
      ultimaDosePorProduto: { cloro: null, acido: last, base: null },
    });
    // Cloro não tem dead time — mas pode ter interlock. Apenas dead time não bloqueia cloro.
    // O interlock (5min) é mais curto que dead time (30min), então só testa dead time isolado.
    // Com INTERLOCK_MS=5min e DEAD_TIME_MS=30min, last=29min atrás → interlock já passou (5min)
    // Então cloro fica livre (não é bloqueado pelo dead time de ácido).
    expect(r).toBeNull();
  });
});

describe("reasonToBlockDose — interlock pH/cloro", () => {
  it("bloqueia cloro dentro do interlock com ácido", () => {
    const lastAcido = NOW - INTERLOCK_MS + 30_000; // 30s antes de expirar
    const r = reasonToBlockDose({
      ...BASE,
      chem: "cloro",
      ultimaDosePorProduto: { cloro: null, acido: lastAcido, base: null },
    });
    expect(r).toMatch(/interlock/i);
  });

  it("bloqueia cloro dentro do interlock com base", () => {
    const lastBase = NOW - INTERLOCK_MS + 30_000;
    const r = reasonToBlockDose({
      ...BASE,
      chem: "cloro",
      ultimaDosePorProduto: { cloro: null, acido: null, base: lastBase },
    });
    expect(r).toMatch(/interlock/i);
  });

  it("bloqueia ácido dentro do interlock com cloro", () => {
    const lastCloro = NOW - INTERLOCK_MS + 30_000;
    const r = reasonToBlockDose({
      ...BASE,
      chem: "acido",
      ultimaDosePorProduto: { cloro: lastCloro, acido: null, base: null },
    });
    expect(r).toMatch(/interlock/i);
  });

  it("libera cloro após interlock com ácido expirar", () => {
    const lastAcido = NOW - INTERLOCK_MS - 1;
    const r = reasonToBlockDose({
      ...BASE,
      chem: "cloro",
      ultimaDosePorProduto: { cloro: null, acido: lastAcido, base: null },
    });
    expect(r).toBeNull();
  });
});

describe("reasonToBlockDose — limite horário", () => {
  it("bloqueia ao atingir MAX_DOSES_PER_HOUR para o produto", () => {
    const stamps = Array.from({ length: MAX_DOSES_PER_HOUR }, (_, i) => ({
      chem: "cloro" as const,
      t: NOW - i * 60_000, // dentro da última hora
    }));
    const r = reasonToBlockDose({ ...BASE, doseTimestamps: stamps });
    expect(r).toMatch(/limite horário/i);
  });

  it("não bloqueia abaixo do limite horário", () => {
    const stamps = Array.from({ length: MAX_DOSES_PER_HOUR - 1 }, (_, i) => ({
      chem: "cloro" as const,
      t: NOW - i * 60_000,
    }));
    const r = reasonToBlockDose({ ...BASE, doseTimestamps: stamps });
    expect(r).toBeNull();
  });

  it("doses de outros produtos não contam para o limite do produto atual", () => {
    const stamps = Array.from({ length: MAX_DOSES_PER_HOUR }, (_, i) => ({
      chem: "acido" as const, // produto diferente
      t: NOW - i * 60_000,
    }));
    const r = reasonToBlockDose({ ...BASE, chem: "cloro", doseTimestamps: stamps });
    expect(r).toBeNull();
  });

  it("doses fora da janela de 1h não contam", () => {
    const stamps = Array.from({ length: MAX_DOSES_PER_HOUR }, (_, i) => ({
      chem: "cloro" as const,
      t: NOW - 3_600_001 - i * 60_000, // mais de 1h atrás
    }));
    const r = reasonToBlockDose({ ...BASE, doseTimestamps: stamps });
    expect(r).toBeNull();
  });
});

describe("reasonToBlockDose — limite diário", () => {
  it("bloqueia ao atingir MAX_DOSES_PER_DAY para o produto", () => {
    // now = noon para garantir que todas as doses no mesmo dia local
    const noon = new Date();
    noon.setHours(12, 0, 0, 0);
    const nowMs = noon.getTime();
    const startOfDay = new Date(noon);
    startOfDay.setHours(0, 0, 0, 0);

    const stamps = Array.from({ length: MAX_DOSES_PER_DAY }, (_, i) => ({
      chem: "cloro" as const,
      t: startOfDay.getTime() + (i + 1) * 60_000,
    }));
    const r = reasonToBlockDose({ ...BASE, now: nowMs, doseTimestamps: stamps });
    expect(r).toMatch(/limite diário/i);
  });

  it("doses do dia anterior não contam para o limite diário", () => {
    const noon = new Date();
    noon.setHours(12, 0, 0, 0);
    const nowMs = noon.getTime();
    const startOfDay = new Date(noon);
    startOfDay.setHours(0, 0, 0, 0);

    // MAX_DOSES_PER_DAY doses, mas todas do dia anterior
    const yesterday = startOfDay.getTime() - 60_000;
    const stamps = Array.from({ length: MAX_DOSES_PER_DAY }, (_, i) => ({
      chem: "cloro" as const,
      t: yesterday - i * 60_000,
    }));
    const r = reasonToBlockDose({ ...BASE, now: nowMs, doseTimestamps: stamps });
    expect(r).toBeNull();
  });
});
