import { describe, it, expect } from "vitest";
import { describeTrend, formatTooltipContent, buildCardAriaLabel } from "./sparklineTooltip";

const NOW = Date.now();
const min = (n: number) => n * 60 * 1000;

describe("formatTooltipContent", () => {
  it("formata pH com 2 casas decimais", () => {
    const r = formatTooltipContent({ v: 7.42, t: NOW - min(5) }, "ph", NOW);
    expect(r.valueLine).toBe("7.42");
    expect(r.timeLine).toMatch(/há \d+ min/);
  });

  it("formata cloro com 1 casa decimal e unidade ppm", () => {
    const r = formatTooltipContent({ v: 2.1, t: NOW - min(23) }, "cloro", NOW);
    expect(r.valueLine).toBe("2.1 ppm");
    expect(r.timeLine).toMatch(/há \d+ min/);
  });

  it("formata alcalinidade com 0 casas e unidade ppm", () => {
    const r = formatTooltipContent({ v: 100, t: NOW - min(60) }, "alcalinidade", NOW);
    expect(r.valueLine).toBe("100 ppm");
    expect(r.timeLine).toMatch(/há 1h/);
  });

  it("retorna ERRO para valor sentinela", () => {
    const r = formatTooltipContent({ v: -99, t: NOW }, "ph", NOW);
    expect(r.valueLine).toBe("ERRO");
    expect(r.timeLine).toBe("—");
  });
});

describe("describeTrend", () => {
  it("detecta tendência estável", () => {
    expect(describeTrend([7.4, 7.41, 7.39, 7.4, 7.4, 7.41], "ph")).toBe("estável");
  });

  it("detecta tendência de subida", () => {
    expect(describeTrend([1.0, 1.2, 1.4, 1.6, 1.8, 2.0], "cloro")).toBe("subindo");
  });

  it("detecta tendência de descida", () => {
    expect(describeTrend([120, 115, 110, 105, 100, 95], "alcalinidade")).toBe("descendo");
  });

  it("detecta oscilação", () => {
    expect(describeTrend([7.3, 7.5, 7.3, 7.5, 7.3, 7.5], "ph")).toBe("oscilando");
  });

  it("retorna sem histórico para arrays curtos", () => {
    expect(describeTrend([7.4, 7.5], "ph")).toBe("sem histórico");
  });
});

describe("buildCardAriaLabel", () => {
  it("inclui unidade ppm para cloro", () => {
    const label = buildCardAriaLabel("cloro", 2.0, [1.8, 1.9, 2.0, 2.1, 2.0, 2.0]);
    expect(label).toContain("Cloro");
    expect(label).toContain("ppm");
  });

  it("inclui unidade ppm para alcalinidade", () => {
    const label = buildCardAriaLabel("alcalinidade", 100, [95, 98, 100, 102, 100, 100]);
    expect(label).toContain("Alcalinidade");
    expect(label).toContain("ppm");
  });
});
