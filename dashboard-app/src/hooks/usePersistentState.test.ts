import { describe, it, expect } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { usePersistentState } from "./usePersistentState";

// Cobre os 4 cenários combinados para o hook que virou infraestrutura.
// Foco especial no #3: o bug de hidratação SSR — quando o efeito de "salvar"
// rodava antes da fase 2, ele sobrescrevia o LS com o defaultValue e
// destruía o valor persistido. Este teste é a regressão.

describe("usePersistentState", () => {
  const KEY = "aquasense.test.key";

  it("1) primeiro render usa defaultValue (antes da hidratação)", () => {
    // Mesmo com valor já no LS, o initial state DEVE ser o default,
    // para evitar mismatch de SSR. A hidratação acontece em useEffect.
    window.localStorage.setItem(KEY, JSON.stringify("persisted"));

    let firstRender: string | undefined;
    renderHook(() => {
      const [value] = usePersistentState<string>(KEY, "default");
      if (firstRender === undefined) firstRender = value;
      return value;
    });

    expect(firstRender).toBe("default");
  });

  it("2) hidrata do localStorage após mount", () => {
    window.localStorage.setItem(KEY, JSON.stringify("persisted"));

    const { result } = renderHook(() =>
      usePersistentState<string>(KEY, "default"),
    );

    // Após mount + flush dos effects, o valor já é o do LS.
    expect(result.current[0]).toBe("persisted");
  });

  it("3) NÃO grava default sobre valor persistido durante a fase 1 (regressão SSR)", () => {
    // Cenário do bug original: hook monta com default → effect de save
    // dispara → escreve "default" no LS → effect de read encontra "default".
    // O fix usa hasHydratedRef para bloquear o save até a leitura completar.
    window.localStorage.setItem(KEY, JSON.stringify("persisted"));

    renderHook(() => usePersistentState<string>(KEY, "default"));

    // O LS ainda deve conter o valor original — não foi sobrescrito.
    expect(JSON.parse(window.localStorage.getItem(KEY)!)).toBe("persisted");
  });

  it("3b) após hidratar, setState grava no LS normalmente", () => {
    const { result } = renderHook(() =>
      usePersistentState<string>(KEY, "default"),
    );

    act(() => {
      result.current[1]("novo");
    });

    expect(result.current[0]).toBe("novo");
    expect(JSON.parse(window.localStorage.getItem(KEY)!)).toBe("novo");
  });

  it("4) validate rejeita valores inválidos e usa fallback", () => {
    // Simula o caso real: enum foi refatorado e o valor antigo do LS não
    // pertence mais ao conjunto válido. O hook deve usar defaultValue
    // sem quebrar.
    window.localStorage.setItem(KEY, JSON.stringify("legacy-value"));
    type Range = "24h" | "7d" | "30d";
    const isRange = (v: unknown): v is Range =>
      v === "24h" || v === "7d" || v === "30d";

    const { result } = renderHook(() =>
      usePersistentState<Range>(KEY, "24h", isRange),
    );

    expect(result.current[0]).toBe("24h");
  });

  it("4b) validate aceita valores válidos do LS", () => {
    window.localStorage.setItem(KEY, JSON.stringify("7d"));
    type Range = "24h" | "7d" | "30d";
    const isRange = (v: unknown): v is Range =>
      v === "24h" || v === "7d" || v === "30d";

    const { result } = renderHook(() =>
      usePersistentState<Range>(KEY, "24h", isRange),
    );

    expect(result.current[0]).toBe("7d");
  });

  it("tolera JSON corrompido sem lançar", () => {
    window.localStorage.setItem(KEY, "{not json");

    const { result } = renderHook(() =>
      usePersistentState<string>(KEY, "fallback"),
    );

    expect(result.current[0]).toBe("fallback");
  });
});