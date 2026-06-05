import { useEffect, useState, useCallback } from "react";

// Hook de tema com 3 opções:
//   "dark"       — navy azulado (padrão)
//   "dark-black" — preto quase absoluto com acento ciano
//   "light"      — branco
//
// Persiste em localStorage; na primeira visita respeita prefers-color-scheme.

const LS_KEY = "aquasense-theme";
export type Theme = "dark" | "dark-black" | "light";

const CYCLE: Theme[] = ["dark", "dark-black", "light"];

function readInitial(): Theme {
  if (typeof window === "undefined") return "dark";
  try {
    const saved = window.localStorage.getItem(LS_KEY);
    if (saved === "dark" || saved === "dark-black" || saved === "light") return saved as Theme;
  } catch {
    // localStorage indisponível (modo privado)
  }
  if (typeof window.matchMedia === "function") {
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }
  return "dark";
}

function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.setAttribute("data-theme", theme);
  root.classList.toggle("light", theme === "light");
  root.classList.toggle("dark-black", theme === "dark-black");
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => readInitial());

  useEffect(() => {
    applyTheme(theme);
    try {
      window.localStorage.setItem(LS_KEY, theme);
    } catch {
      // ignore
    }
  }, [theme]);

  const setTheme = useCallback((t: Theme) => setThemeState(t), []);
  const cycle = useCallback(
    () => setThemeState((t) => CYCLE[(CYCLE.indexOf(t) + 1) % CYCLE.length]),
    [],
  );

  return { theme, setTheme, cycle };
}
