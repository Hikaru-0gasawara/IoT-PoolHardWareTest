// v4.0 — Histórico de comandos da sessão (NÃO persistido).
//
// Vive em memória só. Limpa em F5. Não é auditoria — é feedback educacional
// pro operador ver o que ELE disparou nesta sessão. Distinto de
// "Eventos recentes" (que mostra TUDO que o firmware fez, incluindo doses
// autônomas em modo AUTO).
//
// FIFO de 20 entradas. Quando atinge 21, descarta a mais antiga.

import { useCallback, useState } from "react";
import type { ControlMode, DoseChemical } from "@/types/firmware";

export const COMMAND_HISTORY_MAX = 20;

export type CommandResult =
  | { kind: "pending" }
  | { kind: "confirmed"; t: number }
  | { kind: "blocked"; reason: string; t: number }
  | { kind: "timeout" };

export type CommandHistoryEntry =
  | {
      id: string;
      t: number;
      type: "mode";
      payload: { mode: ControlMode };
      result: CommandResult;
    }
  | {
      id: string;
      t: number;
      type: "dose";
      payload: { parameter: DoseChemical };
      result: CommandResult;
    };

function genId(): string {
  // crypto.randomUUID disponível em todo browser moderno + Node 19+.
  // Fallback defensivo para ambientes de teste sem crypto.
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function pushEntry(
  list: CommandHistoryEntry[],
  entry: CommandHistoryEntry,
): CommandHistoryEntry[] {
  // Mais recente em cima. FIFO: corta o mais antigo (último do array)
  // quando excede o limite.
  const next = [entry, ...list];
  if (next.length > COMMAND_HISTORY_MAX) {
    return next.slice(0, COMMAND_HISTORY_MAX);
  }
  return next;
}

export function updateEntry(
  list: CommandHistoryEntry[],
  id: string,
  result: CommandResult,
): CommandHistoryEntry[] {
  return list.map((e) => (e.id === id ? ({ ...e, result } as CommandHistoryEntry) : e));
}

export function useCommandHistory() {
  const [history, setHistory] = useState<CommandHistoryEntry[]>([]);

  const addModeCommand = useCallback((mode: ControlMode): string => {
    const id = genId();
    setHistory((h) =>
      pushEntry(h, {
        id,
        t: Date.now(),
        type: "mode",
        payload: { mode },
        result: { kind: "pending" },
      }),
    );
    return id;
  }, []);

  const addDoseCommand = useCallback((parameter: DoseChemical): string => {
    const id = genId();
    setHistory((h) =>
      pushEntry(h, {
        id,
        t: Date.now(),
        type: "dose",
        payload: { parameter },
        result: { kind: "pending" },
      }),
    );
    return id;
  }, []);

  const resolveEntry = useCallback((id: string, result: CommandResult) => {
    setHistory((h) => updateEntry(h, id, result));
  }, []);

  return { history, addModeCommand, addDoseCommand, resolveEntry };
}
