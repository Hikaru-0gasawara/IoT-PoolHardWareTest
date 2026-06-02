import { describe, it, expect } from "vitest";
import { formatTooltipContent, describeTrend, buildCardAriaLabel } from "./sparklineTooltip";

const NOW = 1_700_000_000_000;
const min = (n: number) => n * 60_000;

describe("formatTooltipContent", () => {
  it("(a) pH 7.42 há 5 min", () => {
    const r = formatTooltipContent({ v: 7.42, t: NOW - min(5) }, "ph", NOW);
    expect(r).toEqual({ valueLine: "7.42", timeLine: "há 5 min" });
  });

  it("(b) Cloro 1.85 há 23 min", () => {
    const r = formatTooltipContent({ v: 1.85, t: NOW - min(23) }, "cloro", NOW);
    expect(r).toEqual({ valueLine: "1.85 ppm", timeLine: "há 23 min" });
  });

  it("(c) Alcalinidade 105 há 1h", () => {
    const r = formatTooltipContent({ v: 105, t: NOW - min(60) }, "alcalinidade", NOW);
    expect(r).toEqual({ valueLine: "105 ppm", timeLine: "há 1h" });
  });

  it("(d) Temp piscina 32.6 agora", () => {
    const r = formatTooltipContent({ v: 32.6, t: NOW - 1_000 }, "temp_piscina", NOW);
    expect(r).toEqual({ valueLine: "32.6 °C", timeLine: "agora mesmo" });
  });

  it("(e) Sensor com erro -99", () => {
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
  it("inclui valor, status e trend", () => {
    const label = buildCardAriaLabel("cloro", 1.9, [1.85, 1.88, 1.9, 1.89, 1.9]);
    expect(label).toContain("Cloro livre: 1.90 ppm");
    expect(label).toContain("dentro da faixa ideal");
    expect(label).toContain("preliminar");
  });
  it("relata erro de sensor", () => {
    expect(buildCardAriaLabel("temp_piscina", -99, [])).toBe("Temp. Piscina: erro de sensor.");
  });
});