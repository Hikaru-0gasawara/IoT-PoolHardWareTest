import { describe, it, expect } from "vitest";
import { formatTooltipContent, describeTrend, buildCardAriaLabel } from "./sparklineTooltip";

const NOW = 1_700_000_000_000;
const min = (n: number) => n * 60_000;

describe("formatTooltipContent", () => {
  it("(a) pH 7.42 (sem unidade) há 5 min", () => {
    const r = formatTooltipContent({ v: 7.42, t: NOW - min(5) }, "ph", NOW);
    expect(r).toEqual({ valueLine: "7.42", timeLine: "há 5 min" });
  });

  it("(b) ORP 712 mV (0 casas) há 23 min", () => {
    const r = formatTooltipContent({ v: 712, t: NOW - min(23) }, "orp", NOW);
    expect(r).toEqual({ valueLine: "712 mV", timeLine: "há 23 min" });
  });

  it("(c) Condutividade 1200 µS/cm (0 casas) há 1h", () => {
    const r = formatTooltipContent({ v: 1200, t: NOW - min(60) }, "condutividade", NOW);
    expect(r).toEqual({ valueLine: "1200 µS/cm", timeLine: "há 1h" });
  });

  it("(d) Temp piscina 32.6 °C agora", () => {
    const r = formatTooltipContent({ v: 32.6, t: NOW - 1_000 }, "temp_piscina", NOW);
    expect(r).toEqual({ valueLine: "32.6 °C", timeLine: "agora mesmo" });
  });

  it("(e) Temp coletor 45.2 °C há 5 min", () => {
    const r = formatTooltipContent({ v: 45.2, t: NOW - min(5) }, "temp_coletor", NOW);
    expect(r).toEqual({ valueLine: "45.2 °C", timeLine: "há 5 min" });
  });

  it("(f) Sensor com erro -99", () => {
    const r = formatTooltipContent({ v: -99, t: NOW }, "temp_piscina", NOW);
    expect(r).toEqual({ valueLine: "ERRO", timeLine: "—" });
  });
});

describe("describeTrend", () => {
  it("estável quando variação < 5% da faixa ideal", () => {
    expect(describeTrend([7.4, 7.41, 7.4, 7.41, 7.4, 7.41, 7.4], "ph")).toBe("estável");
  });
  it("subindo quando net delta domina a variação", () => {
    expect(describeTrend([26, 27, 28, 29, 30, 31, 32], "temp_piscina")).toBe("subindo");
  });
  it("descendo no caminho oposto", () => {
    expect(describeTrend([32, 31, 30, 29, 28, 27, 26], "temp_piscina")).toBe("descendo");
  });
  it("oscilando quando variação alta mas net delta baixo", () => {
    expect(describeTrend([28, 32, 28, 32, 28, 32, 28], "temp_piscina")).toBe("oscilando");
  });
  it("subindo para ORP (faixa 650-750)", () => {
    expect(describeTrend([650, 670, 690, 710, 730, 750, 770], "orp")).toBe("subindo");
  });
  it("sem histórico para arrays curtos", () => {
    expect(describeTrend([7.4], "ph")).toBe("sem histórico");
  });
  it("preliminar para 3-5 pontos (ex: reconexão MQTT recente)", () => {
    // 4 pontos subindo: sem o gate de 6, classificaria como "subindo"
    expect(describeTrend([26, 28, 30, 32], "temp_piscina")).toBe("preliminar");
  });
  it("descrição normal a partir de 6 pontos", () => {
    expect(describeTrend([26, 27, 28, 29, 30, 31], "temp_piscina")).toBe("subindo");
  });
});

describe("buildCardAriaLabel", () => {
  it("inclui valor, status e trend para pH", () => {
    const label = buildCardAriaLabel("ph", 7.4, [7.38, 7.39, 7.4, 7.41, 7.4]);
    expect(label).toContain("pH: 7.40");
    expect(label).toContain("dentro da faixa ideal");
    expect(label).toContain("preliminar");
  });
  it("inclui unidade mV para ORP", () => {
    const label = buildCardAriaLabel("orp", 700, [690, 695, 700, 705, 700, 700]);
    expect(label).toContain("ORP: 700 mV");
    expect(label).toContain("dentro da faixa ideal");
  });
  it("inclui unidade µS/cm para condutividade", () => {
    const label = buildCardAriaLabel("condutividade", 1200, [1180, 1190, 1200, 1210, 1200, 1200]);
    expect(label).toContain("Condutividade: 1200 µS/cm");
  });
  it("relata erro de sensor", () => {
    expect(buildCardAriaLabel("temp_piscina", -99, [])).toBe("Temp. Piscina: erro de sensor.");
  });
});
