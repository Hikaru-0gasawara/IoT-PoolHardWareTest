import { useEffect, useState, useCallback } from "react";

// Hook de tema (dark/light) com 3 responsabilidades:
//   1) persistir a escolha do usuário em localStorage('aquasense-theme').
//   2) na primeira visita, respeitar prefers-color-scheme do SO.
//   3) aplicar tanto data-theme="dark|light" no <html> (semântico, para
//      seletores futuros e para ferramentas como Lighthouse) quanto a classe
//      `.light` (compatibilidade com os tokens já definidos em styles.css).
//
// Não usa MediaQueryList listener: a preferência do SO só importa na primeira
// visita; uma vez que o usuário escolhe, o LS vira fonte de verdade.

const LS_KEY = "aquasense-theme";
type Theme = "dark" | "light";

function readInitial(): Theme {
  if (typeof window === "undefined") return "dark";
  try {
    const saved = window.localStorage.getItem(LS_KEY);
    if (saved === "dark" || saved === "light") return saved;
  } catch {
    // localStorage indisponível (modo privado) — segue para fallback do SO
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
  const toggle = useCallback(() => setThemeState((t) => (t === "dark" ? "light" : "dark")), []);

  return { theme, setTheme, toggle };
}
