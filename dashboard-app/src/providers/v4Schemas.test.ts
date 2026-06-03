import { describe, it, expect } from "vitest";
import {
  SnapshotSchema,
  DosingEventSchema,
  DosingResponseSchema,
  DosingCommandSchema,
  parseSnapshot,
} from "./MqttProvider";

// Schema do firmware ESP32 AquaSense v3.0 (protocolo PT).
// Payload consolidado (retain) em aquasense-ibmec-pt/dados (flat):
//   { ph, orp_mv, cloro, alcalinidade, condutividade_us_cm,
//     temp_piscina, temp_coletor, delta_t, umidade, bomba, alertas, ciclo,
//     modo, parada_emergencia, dose_em_andamento }
// Evento de dosagem em aquasense-ibmec-pt/dosagem/evento:
//   { parametro, evento, motivo?, fonte }
// Comando que o dashboard publica em aquasense-ibmec-pt/dosagem/comando:
//   { parametro, origem, comando_id }

describe("SnapshotSchema (aquasense-ibmec-pt/dados)", () => {
  const base = {
    ph: 7.4,
    orp_mv: 700,
    condutividade_us_cm: 1200,
    temp_piscina: 32.6,
    temp_coletor: 45.2,
    bomba: "LIGADA",
  };

  it("aceita payload mínimo do firmware v3.0", () => {
    const r = SnapshotSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.ph).toBe(7.4);
      expect(r.data.orp_mv).toBe(700);
      expect(r.data.condutividade_us_cm).toBe(1200);
    }
  });

  it("aceita bomba como boolean e como string PT (LIGADA/DESLIGADA) e ON/OFF", () => {
    expect(SnapshotSchema.safeParse({ ...base, bomba: true }).success).toBe(true);
    expect(SnapshotSchema.safeParse({ ...base, bomba: "LIGADA" }).success).toBe(true);
    expect(SnapshotSchema.safeParse({ ...base, bomba: "DESLIGADA" }).success).toBe(true);
    expect(SnapshotSchema.safeParse({ ...base, bomba: "ON" }).success).toBe(true);
  });

  it("aceita campos extras do firmware via passthrough (cloro, alcalinidade, modo...)", () => {
    const r = SnapshotSchema.safeParse({
      ...base,
      projeto: "AquaSense IoT",
      cloro: 2.0,
      alcalinidade: 100,
      delta_t: 12.6,
      umidade: 55,
      alertas: ["pH alto"],
      ciclo: 1234,
      modo: "automatico",
      parada_emergencia: false,
      dose_em_andamento: null,
    });
    expect(r.success).toBe(true);
  });

  it("aceita valor sentinela -99 (erro de sensor) fora da faixa normal", () => {
    const r = SnapshotSchema.safeParse({ ...base, ph: -99 });
    expect(r.success).toBe(true);
  });

  it("rejeita ph fora da faixa física [0, 14]", () => {
    expect(SnapshotSchema.safeParse({ ...base, ph: 20 }).success).toBe(false);
  });

  it("rejeita condutividade negativa (fora da faixa, não sentinela)", () => {
    expect(SnapshotSchema.safeParse({ ...base, condutividade_us_cm: -10 }).success).toBe(false);
  });

  it("rejeita quando falta um campo obrigatório", () => {
    const { ph, ...semPh } = base;
    void ph;
    expect(SnapshotSchema.safeParse(semPh).success).toBe(false);
  });

  it("rejeita bomba com valor inválido", () => {
    expect(SnapshotSchema.safeParse({ ...base, bomba: "talvez" }).success).toBe(false);
  });
});

describe("parseSnapshot — fixture do payload real do firmware v3.0", () => {
  it("mapeia o JSON de /dados para AquaSenseData", () => {
    const raw = JSON.stringify({
      projeto: "AquaSense IoT",
      ciclo: 42,
      ph: 7.42,
      orp_mv: 712,
      cloro: 2.1,
      alcalinidade: 118,
      condutividade_us_cm: 1180,
      temp_piscina: 30.5,
      temp_coletor: 42.8,
      delta_t: 12.3,
      umidade: 55,
      bomba: "LIGADA",
      alertas: [],
      modo: "automatico",
      parada_emergencia: false,
      dose_em_andamento: null,
    });
    const d = parseSnapshot(raw);
    expect(d).not.toBeNull();
    if (!d) return;
    expect(d.qualidade_agua.ph).toBe(7.42);
    expect(d.qualidade_agua.orp_mv).toBe(712);
    expect(d.qualidade_agua.cond_us).toBe(1180);
    expect(d.qualidade_agua.ph_status).toBe("OK");
    expect(d.qualidade_agua.orp_status).toBe("OK");
    expect(d.qualidade_agua.cond_status).toBe("OK");
    expect(d.temperaturas.piscina_C).toBe(30.5);
    expect(d.temperaturas.coletor_solar_C).toBe(42.8);
    expect(d.temperaturas.delta_T).toBeCloseTo(12.3, 1);
    expect(d.controle.bomba).toBe("LIGADA");
    expect(d.ciclo).toBe(42);
  });

  it("deriva delta_T quando ausente (temp_coletor - temp_piscina)", () => {
    const raw = JSON.stringify({
      ph: 7.4,
      orp_mv: 700,
      condutividade_us_cm: 1200,
      temp_piscina: 30.5,
      temp_coletor: 42.8,
      bomba: "ON",
    });
    const d = parseSnapshot(raw);
    expect(d).not.toBeNull();
    if (!d) return;
    expect(d.temperaturas.delta_T).toBeCloseTo(12.3, 1);
  });

  it("classifica status BAIXO/ALTO conforme as faixas do firmware", () => {
    const raw = JSON.stringify({
      ph: 6.5,
      orp_mv: 800,
      condutividade_us_cm: 500,
      temp_piscina: 28,
      temp_coletor: 30,
      bomba: false,
    });
    const d = parseSnapshot(raw);
    expect(d).not.toBeNull();
    if (!d) return;
    expect(d.qualidade_agua.ph_status).toBe("BAIXO"); // < 7.2
    expect(d.qualidade_agua.orp_status).toBe("ALTO"); // > 750
    expect(d.qualidade_agua.cond_status).toBe("BAIXO"); // < 800
    expect(d.controle.bomba).toBe("DESLIGADA");
  });

  it("retorna null para JSON inválido", () => {
    expect(parseSnapshot("não é json")).toBeNull();
  });

  it("retorna null para payload que falha o schema", () => {
    expect(parseSnapshot(JSON.stringify({ ph: 7.4 }))).toBeNull();
  });

  it("preserva valor sentinela -99 (erro de sensor) sem rejeitar o snapshot", () => {
    const raw = JSON.stringify({
      ph: -99,
      orp_mv: 700,
      condutividade_us_cm: 1200,
      temp_piscina: 30,
      temp_coletor: 40,
      bomba: "ON",
    });
    const d = parseSnapshot(raw);
    expect(d).not.toBeNull();
    if (!d) return;
    expect(d.qualidade_agua.ph).toBe(-99);
  });
});

describe("DosingEventSchema (aquasense-ibmec-pt/dosagem/evento)", () => {
  it("aceita evento completo do firmware", () => {
    const r = DosingEventSchema.safeParse({
      parametro: "cloro",
      evento: "iniciada",
      motivo: "comando do operador",
      fonte: "manual",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.evento).toBe("iniciada");
  });

  it("aceita evento mínimo (parametro + evento)", () => {
    const r = DosingEventSchema.safeParse({ parametro: "acido", evento: "concluida" });
    expect(r.success).toBe(true);
  });

  it("aceita os 3 eventos válidos (iniciada|concluida|bloqueada)", () => {
    for (const evento of ["iniciada", "concluida", "bloqueada"]) {
      expect(DosingEventSchema.safeParse({ parametro: "cloro", evento }).success).toBe(true);
    }
  });

  it("rejeita evento inválido", () => {
    expect(
      DosingEventSchema.safeParse({ parametro: "cloro", evento: "sucesso" }).success,
    ).toBe(false);
  });

  it("rejeita parametro fora dos 3 produtos", () => {
    expect(
      DosingEventSchema.safeParse({ parametro: "alcalino", evento: "iniciada" }).success,
    ).toBe(false);
  });

  it("rejeita quando falta o evento", () => {
    expect(DosingEventSchema.safeParse({ parametro: "cloro" }).success).toBe(false);
  });

  it("DosingResponseSchema é alias de DosingEventSchema (compat)", () => {
    expect(DosingResponseSchema).toBe(DosingEventSchema);
  });
});

describe("DosingCommandSchema (aquasense-ibmec-pt/dosagem/comando)", () => {
  it("aceita comando válido { parametro, origem, comando_id }", () => {
    const r = DosingCommandSchema.safeParse({
      parametro: "cloro",
      origem: "manual",
      comando_id: "cmd-abc",
    });
    expect(r.success).toBe(true);
  });

  it("aceita os 3 produtos (cloro|acido|base)", () => {
    for (const parametro of ["cloro", "acido", "base"]) {
      expect(
        DosingCommandSchema.safeParse({ parametro, origem: "manual", comando_id: "c" }).success,
      ).toBe(true);
    }
  });

  it("aceita origem automatico", () => {
    expect(
      DosingCommandSchema.safeParse({ parametro: "acido", origem: "automatico", comando_id: "c" })
        .success,
    ).toBe(true);
  });

  it("rejeita parametro inválido", () => {
    expect(
      DosingCommandSchema.safeParse({ parametro: "ph", origem: "manual", comando_id: "c" }).success,
    ).toBe(false);
  });

  it("rejeita origem inválida", () => {
    expect(
      DosingCommandSchema.safeParse({ parametro: "cloro", origem: "sistema", comando_id: "c" })
        .success,
    ).toBe(false);
  });

  it("rejeita comando_id ausente", () => {
    expect(
      DosingCommandSchema.safeParse({ parametro: "cloro", origem: "manual" }).success,
    ).toBe(false);
  });
});
