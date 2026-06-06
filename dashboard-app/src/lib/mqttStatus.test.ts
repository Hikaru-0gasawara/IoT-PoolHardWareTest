import { describe, it, expect } from "vitest";
import { describeMqttStatus, formatAge } from "@/lib/mqttStatus";

// Thresholds (from mqttStatus.ts — not exported, tested via behavior):
//   FRESH_BELOW_MS  = 10_000  (<10s   → "fresh")
//   STALE_AFTER_MS  = 30_000  (>30s   → "stale")
//   SILENT_AFTER_MS = 300_000 (>5min  → "silent")

const NOW = 1_700_000_000_000;

describe("describeMqttStatus — fallback (simulação local)", () => {
  it("retorna tone=warn com label de simulação independente do status TCP", () => {
    const v = describeMqttStatus("connected", "fallback", null, NOW);
    expect(v.tone).toBe("warn");
    expect(v.label).toMatch(/simulação/i);
  });

  it("retorna tone=warn mesmo desconectado quando source=fallback", () => {
    const v = describeMqttStatus("disconnected", "fallback", NOW - 5_000, NOW);
    expect(v.tone).toBe("warn");
  });
});

describe("describeMqttStatus — connecting", () => {
  it("retorna tone=neutral durante conexão inicial", () => {
    const v = describeMqttStatus("connecting", "mqtt", null, NOW);
    expect(v.tone).toBe("neutral");
    expect(v.label).toMatch(/conectando/i);
  });
});

describe("describeMqttStatus — disconnected / error", () => {
  it("retorna tone=crit quando desconectado", () => {
    const v = describeMqttStatus("disconnected", "mqtt", null, NOW);
    expect(v.tone).toBe("crit");
  });

  it("retorna tone=crit em estado de erro", () => {
    const v = describeMqttStatus("error", "mqtt", null, NOW);
    expect(v.tone).toBe("crit");
  });
});

describe("describeMqttStatus — connected + mqtt", () => {
  it("retorna neutral enquanto aguarda primeira mensagem (lastMessageAt=null)", () => {
    const v = describeMqttStatus("connected", "mqtt", null, NOW);
    expect(v.tone).toBe("neutral");
    expect(v.label).toMatch(/aguardando/i);
    expect(v.ageSec).toBeNull();
  });

  it("retorna ok/fresh com sublabel 'agora mesmo' para mensagem <10s", () => {
    const v = describeMqttStatus("connected", "mqtt", NOW - 5_000, NOW);
    expect(v.tone).toBe("ok");
    expect(v.staleness).toBe("fresh");
    expect(v.sublabel).toBe("agora mesmo");
  });

  it("retorna ok/recent com sublabel de idade para mensagem 10-30s atrás", () => {
    const v = describeMqttStatus("connected", "mqtt", NOW - 15_000, NOW);
    expect(v.tone).toBe("ok");
    expect(v.staleness).toBe("recent");
    expect(v.sublabel).toMatch(/há 15s/);
  });

  it("retorna warn/stale para mensagem 30s-5min atrás", () => {
    const v = describeMqttStatus("connected", "mqtt", NOW - 60_000, NOW);
    expect(v.tone).toBe("warn");
    expect(v.staleness).toBe("stale");
    expect(v.sublabel).toMatch(/obsoleto/i);
  });

  it("retorna crit/silent para mensagem >5min atrás", () => {
    const v = describeMqttStatus("connected", "mqtt", NOW - 6 * 60_000, NOW);
    expect(v.tone).toBe("crit");
    expect(v.staleness).toBe("silent");
    expect(v.label).toMatch(/sem resposta/i);
    expect(v.sublabel).toMatch(/há/i);
  });

  it("retorna ageSec=0 para mensagem agora mesmo", () => {
    const v = describeMqttStatus("connected", "mqtt", NOW, NOW);
    expect(v.ageSec).toBe(0);
  });

  it("retorna ageSec como floor(ageMs/1000)", () => {
    const v = describeMqttStatus("connected", "mqtt", NOW - 5_999, NOW);
    expect(v.ageSec).toBe(5);
  });
});

describe("describeMqttStatus — transições de staleness exatas", () => {
  it("exatamente no limite fresh/recent (10000ms) → recent", () => {
    const v = describeMqttStatus("connected", "mqtt", NOW - 10_000, NOW);
    expect(v.staleness).toBe("recent");
  });

  it("exatamente no limite recent/stale (30000ms) → stale", () => {
    const v = describeMqttStatus("connected", "mqtt", NOW - 30_000, NOW);
    expect(v.staleness).toBe("stale");
  });

  it("exatamente no limite stale/silent (300000ms) → silent", () => {
    const v = describeMqttStatus("connected", "mqtt", NOW - 300_000, NOW);
    expect(v.staleness).toBe("silent");
  });
});

describe("formatAge", () => {
  it("formata segundos abaixo de 60s", () => {
    expect(formatAge(0)).toBe("há 0s");
    expect(formatAge(5_000)).toBe("há 5s");
    expect(formatAge(59_000)).toBe("há 59s");
  });

  it("formata minutos de 1min a 59min", () => {
    expect(formatAge(60_000)).toBe("há 1min");
    expect(formatAge(90_000)).toBe("há 1min"); // floor
    expect(formatAge(120_000)).toBe("há 2min");
    expect(formatAge(3_599_000)).toBe("há 59min");
  });

  it("formata horas a partir de 60min", () => {
    expect(formatAge(3_600_000)).toBe("há 1h");
    expect(formatAge(7_200_000)).toBe("há 2h");
    expect(formatAge(86_400_000)).toBe("há 24h");
  });
});
