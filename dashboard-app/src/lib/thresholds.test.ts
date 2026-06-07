import { describe, it, expect } from "vitest";
import { THRESHOLDS, statusFor, waterStatusFor, aggregateStatus } from "@/lib/thresholds";

// waterStatusFor é o status DIRECIONAL (OK/BAIXO/ALTO) que alimenta
// qualidade_agua.*_status. Antes existia duplicado em MqttProvider e em
// useAquaSense, com os limites (7.2/7.6, 1.0/3.0, 80/120) escritos à mão. Agora
// deriva da faixa IDEAL de THRESHOLDS — estes testes travam esse contrato.

describe("waterStatusFor (status direcional OK/BAIXO/ALTO)", () => {
  it("retorna OK dentro da faixa ideal (incl. limites)", () => {
    expect(waterStatusFor("ph", 7.4)).toBe("OK");
    expect(waterStatusFor("ph", THRESHOLDS.ph.idealMin)).toBe("OK");
    expect(waterStatusFor("ph", THRESHOLDS.ph.idealMax)).toBe("OK");
    expect(waterStatusFor("cloro", 2.0)).toBe("OK");
    expect(waterStatusFor("alcalinidade", 100)).toBe("OK");
  });

  it("retorna BAIXO abaixo do idealMin", () => {
    expect(waterStatusFor("ph", 6.5)).toBe("BAIXO");
    expect(waterStatusFor("cloro", 0.5)).toBe("BAIXO");
    expect(waterStatusFor("alcalinidade", 50)).toBe("BAIXO");
  });

  it("retorna ALTO acima do idealMax", () => {
    expect(waterStatusFor("ph", 7.9)).toBe("ALTO");
    expect(waterStatusFor("cloro", 4.0)).toBe("ALTO");
    expect(waterStatusFor("alcalinidade", 130)).toBe("ALTO");
  });

  it("trata erro de sensor (-99) como OK — a UI sinaliza o erro à parte", () => {
    expect(waterStatusFor("ph", -99)).toBe("OK");
    expect(waterStatusFor("cloro", -99)).toBe("OK");
    expect(waterStatusFor("alcalinidade", -99)).toBe("OK");
  });

  it("usa as faixas de THRESHOLDS como fonte única (sem números mágicos)", () => {
    // Qualquer mudança nas faixas ideais deve refletir aqui automaticamente.
    expect(waterStatusFor("ph", THRESHOLDS.ph.idealMin - 0.01)).toBe("BAIXO");
    expect(waterStatusFor("ph", THRESHOLDS.ph.idealMax + 0.01)).toBe("ALTO");
    expect(waterStatusFor("cloro", THRESHOLDS.cloro.idealMin - 0.01)).toBe("BAIXO");
    expect(waterStatusFor("cloro", THRESHOLDS.cloro.idealMax + 0.01)).toBe("ALTO");
    expect(waterStatusFor("alcalinidade", THRESHOLDS.alcalinidade.idealMin - 1)).toBe("BAIXO");
    expect(waterStatusFor("alcalinidade", THRESHOLDS.alcalinidade.idealMax + 1)).toBe("ALTO");
  });
});

describe("statusFor (severidade ok/warn/crit)", () => {
  it("ok dentro do ideal, warn na zona de atenção, crit fora do warn", () => {
    expect(statusFor("ph", 7.4)).toBe("ok");
    expect(statusFor("ph", 7.1)).toBe("warn"); // entre warnMin(7.0) e idealMin(7.2)
    expect(statusFor("ph", 6.9)).toBe("crit"); // < warnMin(7.0)
  });

  it("temp_coletor é referência ambiental — sempre ok", () => {
    expect(statusFor("temp_coletor", 5)).toBe("ok");
    expect(statusFor("temp_coletor", 200)).toBe("ok");
  });
});

describe("aggregateStatus (pior caso)", () => {
  it("crit vence warn vence ok", () => {
    expect(aggregateStatus({ ph: 7.4, cloro: 2.0 })).toBe("ok");
    expect(aggregateStatus({ ph: 7.1, cloro: 2.0 })).toBe("warn");
    expect(aggregateStatus({ ph: 6.9, cloro: 2.0 })).toBe("crit");
    expect(aggregateStatus({ ph: 7.1, cloro: 0.2 })).toBe("crit"); // cloro < warnMin(0.5)
  });
});
