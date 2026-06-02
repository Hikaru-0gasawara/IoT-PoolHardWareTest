import { describe, it, expect } from "vitest";
import { DosingEventSchema, ControlStateSchema, SystemHealthSchema } from "./MqttProvider";

// FORK PT — schemas agora aceitam payload em PT do firmware main_pt.py.
// Wire format PT é traduzido para internals EN via z.transform / mappers.

describe("DosingEventSchema (aquasense-ibmec-pt/dosagem/evento)", () => {
  it("aceita payload mínimo PT: parametro + evento", () => {
    const r = DosingEventSchema.safeParse({ parametro: "cloro", evento: "iniciada" });
    expect(r.success).toBe(true);
  });

  it("aceita payload completo com motivo, contadores e fonte (Melhoria 1)", () => {
    const r = DosingEventSchema.safeParse({
      parametro: "acido",
      evento: "bloqueada",
      motivo: "intertravamento_ph_cloro",
      doses_hora: 1,
      doses_dia: 4,
      fonte: "automatico",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.evento).toBe("bloqueada");
      expect(r.data.fonte).toBe("automatico");
    }
  });

  it("aceita evento bloqueada com fonte=manual (auditoria operador)", () => {
    const r = DosingEventSchema.safeParse({
      parametro: "cloro",
      evento: "bloqueada",
      motivo: "tempo_morto",
      fonte: "manual",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.fonte).toBe("manual");
  });

  it("rejeita parametro inválido (fora dos 3 produtos)", () => {
    const r = DosingEventSchema.safeParse({ parametro: "alcalinizante", evento: "iniciada" });
    expect(r.success).toBe(false);
  });

  it("rejeita evento inválido (fora dos 3 estados PT)", () => {
    const r = DosingEventSchema.safeParse({ parametro: "cloro", evento: "ligando" });
    expect(r.success).toBe(false);
  });

  it("rejeita fonte inválida (só automatico|manual)", () => {
    const r = DosingEventSchema.safeParse({
      parametro: "cloro",
      evento: "bloqueada",
      fonte: "sistema",
    });
    expect(r.success).toBe(false);
  });
});

describe("ControlStateSchema (aquasense-ibmec-pt/controle/estado, retain)", () => {
  it("aceita estado normal: automatico, sem parada_emergencia, sem dose", () => {
    const r = ControlStateSchema.safeParse({
      modo: "automatico",
      parada_emergencia: false,
      dose_em_andamento: null,
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.modo).toBe("automatico");
      expect(r.data.dose_em_andamento).toBeNull();
    }
  });

  it("aceita estado de emergência: parada_emergencia=true", () => {
    const r = ControlStateSchema.safeParse({
      modo: "parada",
      parada_emergencia: true,
      dose_em_andamento: null,
    });
    expect(r.success).toBe(true);
  });

  it("aceita dose em andamento", () => {
    const r = ControlStateSchema.safeParse({
      modo: "automatico",
      parada_emergencia: false,
      dose_em_andamento: "cloro",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.dose_em_andamento).toBe("cloro");
  });

  it("rejeita quando parada_emergencia não é boolean", () => {
    const r = ControlStateSchema.safeParse({
      modo: "automatico",
      parada_emergencia: "true",
      dose_em_andamento: null,
    });
    expect(r.success).toBe(false);
  });
});

describe("SystemHealthSchema (aquasense-ibmec-pt/sistema/saude)", () => {
  it("aceita payload completo PT do firmware main_pt.py", () => {
    const r = SystemHealthSchema.safeParse({
      tempo_ativo_s: 3600,
      heap_livre_kb: 84,
      rssi_wifi_dbm: -65,
      erros_dht: 0,
      erros_ds: 0,
      falhas_mqtt: 1,
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.tempo_ativo_s).toBe(3600);
  });

  it("aceita payload parcial: só tempo_ativo_s", () => {
    const r = SystemHealthSchema.safeParse({ tempo_ativo_s: 120 });
    expect(r.success).toBe(true);
  });

  it("aceita payload vazio", () => {
    const r = SystemHealthSchema.safeParse({});
    expect(r.success).toBe(true);
  });

  it("rejeita RSSI positivo", () => {
    const r = SystemHealthSchema.safeParse({ rssi_wifi_dbm: 5 });
    expect(r.success).toBe(false);
  });

  it("rejeita tempo_ativo_s negativo", () => {
    const r = SystemHealthSchema.safeParse({ tempo_ativo_s: -1 });
    expect(r.success).toBe(false);
  });

  it("aceita doses_hoje com os 3 produtos", () => {
    const r = SystemHealthSchema.safeParse({
      doses_hoje: { cloro: 2, acido: 1, base: 0 },
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.doses_hoje?.cloro).toBe(2);
  });

  it("rejeita doses_hoje com valor negativo", () => {
    const r = SystemHealthSchema.safeParse({
      doses_hoje: { cloro: -1, acido: 0, base: 0 },
    });
    expect(r.success).toBe(false);
  });

  it("aceita payload SEM doses_hoje", () => {
    const r = SystemHealthSchema.safeParse({ tempo_ativo_s: 60 });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.doses_hoje).toBeUndefined();
  });
});
