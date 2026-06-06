import { useMemo } from "react";
import { useSyncExternalStore } from "react";

// Per-interval singletons — all components sharing the same intervalMs
// share one setInterval instead of creating N separate timers.
const _listeners = new Map<number, Set<() => void>>();
const _timers = new Map<number, ReturnType<typeof setInterval>>();
const _snapshots = new Map<number, number>();

function _makeSubscribe(intervalMs: number) {
  return (cb: () => void): (() => void) => {
    let set = _listeners.get(intervalMs);
    if (!set) {
      set = new Set();
      _listeners.set(intervalMs, set);
      _snapshots.set(intervalMs, Date.now());
    }
    set.add(cb);
    if (set.size === 1) {
      _timers.set(
        intervalMs,
        setInterval(() => {
          _snapshots.set(intervalMs, Date.now());
          _listeners.get(intervalMs)?.forEach((l) => l());
        }, intervalMs),
      );
    }
    return () => {
      const s = _listeners.get(intervalMs);
      if (!s) return;
      s.delete(cb);
      if (s.size === 0) {
        clearInterval(_timers.get(intervalMs));
        _timers.delete(intervalMs);
        _listeners.delete(intervalMs);
        _snapshots.delete(intervalMs);
      }
    };
  };
}

function _makeGetSnapshot(intervalMs: number) {
  return () => _snapshots.get(intervalMs) ?? Date.now();
}

// Shared clock — all callers with the same intervalMs share one setInterval.
export function useNow(intervalMs = 1000): number {
  const subscribe = useMemo(() => _makeSubscribe(intervalMs), [intervalMs]);
  const getSnapshot = useMemo(() => _makeGetSnapshot(intervalMs), [intervalMs]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
