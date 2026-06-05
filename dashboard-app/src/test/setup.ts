import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Limpa DOM e localStorage entre testes — isolamento total.
afterEach(() => {
  cleanup();
  window.localStorage.clear();
});
