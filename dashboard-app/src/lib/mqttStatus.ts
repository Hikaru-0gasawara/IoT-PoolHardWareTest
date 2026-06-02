// Mapeia (status, source, lastMessageAt, now) → label legível + cor + sublabel.
// Função pura: testável sem React.
//
// Princípio: status do TCP pode mentir (keep-alive), mas dado novo nunca mente.
// Por isso a obsolescência (now - lastMessageAt) tem prioridade sobre o status
// quando estamos em modo MQTT real.

import type { DataSource, MqttConnectionStatus } from "@/types/firmware";

export type MqttStatusTone = "ok" | "neutral" | "warn" | "crit";

export interface MqttStatusView {
  label: string;
  sublabel?: string;
  tone: MqttStatusTone;
  staleness: "fresh" | "recent" | "stale" | "silent";
  ageSec: number | null;
}

const STALE_AFTER_MS = 30_000; // 30s — dados começam a envelhecer
const SILENT_AFTER_MS = 5 * 60_000; // 5min — ESP32 considerado mudo
const FRESH_BELOW_MS = 10_000; // <10s — "agora mesmo"

function ageOf(lastMessageAt: number | null, now: number): number | null {
  if (lastMessageAt == null) return null;
  return Math.max(0, now - lastMessageAt);
}

function classifyStaleness(ageMs: number | null): MqttStatusView["staleness"] {
  if (ageMs == null) return "silent";
  if (ageMs < FRESH_BELOW_MS) return "fresh";
  if (ageMs < STALE_AFTER_MS) return "recent";
  if (ageMs < SILENT_AFTER_MS) return "stale";
  return "silent";
}

export function formatAge(ageMs: number): string {
  const s = Math.floor(ageMs / 1000);
  if (s < 60) return `há ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `há ${m}min`;
  const h = Math.floor(m / 60);
  return `há ${h}h`;
}

export function describeMqttStatus(
  status: MqttConnectionStatus,
  source: DataSource,
  lastMessageAt: number | null,
  now: number,
): MqttStatusView {
  const ageMs = ageOf(lastMessageAt, now);
  const staleness = classifyStaleness(ageMs);
  const ageSec = ageMs == null ? null : Math.floor(ageMs / 1000);

  // Fallback é mock — não importa o tempo, a "fonte" é simulação local.
  if (source === "fallback") {
    return {
      label: "Modo simulação local",
      sublabel: "ESP32 fora do ar — exibindo dados sintéticos",
      tone: "warn",
      staleness,
      ageSec,
    };
  }

  if (status === "connecting") {
    return { label: "Conectando…", tone: "neutral", staleness, ageSec };
  }

  if (status === "disconnected" || status === "error") {
    return { label: "Desconectado", tone: "crit", staleness, ageSec };
  }

  // status === "connected"
  if (source !== "mqtt" || ageMs == null) {
    // conectado ao broker mas ainda não recebeu nenhuma mensagem
    return { label: "Conectado · aguardando dados", tone: "neutral", staleness, ageSec };
  }

  if (staleness === "silent") {
    return {
      label: "ESP32 sem resposta",
      sublabel: ageMs != null ? `última mensagem ${formatAge(ageMs)}` : undefined,
      tone: "crit",
      staleness,
      ageSec,
    };
  }

  if (staleness === "stale") {
    return {
      label: "Conectado",
      sublabel: `dados obsoletos · ${formatAge(ageMs)}`,
      tone: "warn",
      staleness,
      ageSec,
    };
  }

  // fresh ou recent
  return {
    label: "Conectado",
    sublabel: staleness === "fresh" ? "agora mesmo" : formatAge(ageMs),
    tone: "ok",
    staleness,
    ageSec,
  };
}

export function toneToColor(tone: MqttStatusTone): string {
  switch (tone) {
    case "ok": return "var(--status-ok)";
    case "warn": return "var(--status-warn)";
    case "crit": return "var(--status-crit)";
    case "neutral":
    default: return "var(--aqua-text-muted)";
  }
}
