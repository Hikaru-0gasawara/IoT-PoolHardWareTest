import { describe, it, expect } from "vitest";
import {
  pushEntry,
  updateEntry,
  COMMAND_HISTORY_MAX,
  type CommandHistoryEntry,
} from "./useCommandHistory";

function makeEntry(i: number): CommandHistoryEntry {
  return {
    id: `id-${i}`,
    t: 1_700_000_000_000 + i,
    type: "dose",
    payload: { parameter: "cloro" },
    result: { kind: "pending" },
  };
}

describe("useCommandHistory — FIFO de 20", () => {
  it("mantém máximo 20 entradas; ao adicionar a 21ª, descarta a mais antiga", () => {
    let list: CommandHistoryEntry[] = [];
    for (let i = 0; i < 25; i++) {
      list = pushEntry(list, makeEntry(i));
    }
    expect(list).toHaveLength(COMMAND_HISTORY_MAX);
    expect(COMMAND_HISTORY_MAX).toBe(20);
    // A primeira do array é a mais recente (i=24); a última é i=5.
    // As 5 primeiras (i=0..4) foram descartadas.
    expect(list[0].id).toBe("id-24");
    expect(list[list.length - 1].id).toBe("id-5");
    expect(list.find((e) => e.id === "id-0")).toBeUndefined();
    expect(list.find((e) => e.id === "id-4")).toBeUndefined();
  });

  it("updateEntry troca o result da entrada certa sem mexer nas outras", () => {
    let list: CommandHistoryEntry[] = [];
    list = pushEntry(list, makeEntry(1));
    list = pushEntry(list, makeEntry(2));
    list = updateEntry(list, "id-1", { kind: "confirmed", t: 999 });
    const e1 = list.find((e) => e.id === "id-1");
    const e2 = list.find((e) => e.id === "id-2");
    expect(e1?.result).toEqual({ kind: "confirmed", t: 999 });
    expect(e2?.result).toEqual({ kind: "pending" });
  });
});
