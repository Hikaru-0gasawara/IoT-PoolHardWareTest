// Hooks tipados que expõem os dados do firmware AquaSense para os componentes.
// Eles leem do MqttProvider (fonte real) e caem no poolStore (mock simulado)
// como fallback. A UI nunca precisa saber qual é a origem.

import { useMqtt } from "@/providers/MqttProvider";
import { usePoolStore } from "@/store/poolStore";
import type {
  AquaSenseData, ControlStateMessage, DataSource, DoseChemical, DoseEvent,
  MqttConnectionStatus, PumpState, SystemHealthMessage, Temperatures, WaterQuality,
} from "@/types/firmware";

function buildFromStore(): AquaSenseData {
  const s = usePoolStore.getState();
  const wq: WaterQuality = {
    ph: s.ph,
    ph_status: s.ph < 7.2 ? "BAIXO" : s.ph > 7.6 ? "ALTO" : "OK",
    cloro_ppm: s.cloro,
    cloro_status: s.cloro < 1.0 ? "BAIXO" : s.cloro > 3.0 ? "ALTO" : "OK",
    orp_mv: s.orp_mv,
    alcalinidade_ppm: s.alcalinidade,
    alcalinidade_status: s.alcalinidade < 80 ? "BAIXO" : s.alcalinidade > 120 ? "ALTO" : "OK",
  };
  const tp: Temperatures = {
    piscina_C: s.temp_piscina,
    coletor_solar_C: s.temp_coletor,
    delta_T: s.delta_t,
    umidade_pct: 65,
  };
  const ctrl: PumpState = {
    bomba: s.bomba_ligada ? "LIGADA" : "DESLIGADA",
    led_status: s.status_geral === "ok" ? "ACESO" : "APAGADO",
  };
  return {
    projeto: "AquaSense IoT",
    ciclo: 0,
    qualidade_agua: wq,
    temperaturas: tp,
    controle: ctrl,
    alertas: s.alerts
      .filter((a) => a.status === "ativo" && !a.id.startsWith("shadow:"))
      .map((a) => `${a.parametro} ${a.severity === "crit" ? "crítico" : "atenção"}: ${a.valor_atual.toFixed(2)}${a.unidade ? " " + a.unidade : ""}`),
  };
}

function useAquaSenseData(): AquaSenseData {
  const mqtt = useMqtt();
  // Re-render quando o store muda (snapshot via subscribe interno do zustand)
  const tick = usePoolStore((s) => s.lastTickAt);
  if (mqtt.data) return mqtt.data;
  // tick é referenciado para forçar re-render quando o store atualiza
  void tick;
  return buildFromStore();
}

export function usePoolData(): WaterQuality {
  return useAquaSenseData().qualidade_agua;
}

export function useTemperatures(): Temperatures {
  return useAquaSenseData().temperaturas;
}

export function usePumpControl(): PumpState & { delta_T: number } {
  const data = useAquaSenseData();
  return { ...data.controle, delta_T: data.temperaturas.delta_T };
}

export function useAlerts(): string[] {
  return useAquaSenseData().alertas;
}

export function useConnection(): {
  status: MqttConnectionStatus;
  source: DataSource;
  cycle: number | null;
  lastMessageAt: number | null;
  gaps: import("@/lib/cycleGaps").GapEvent[];
  totalGaps: number;
  messagesReceivedCount: number;
  providerMountedAt: number;
} {
  const m = useMqtt();
  return {
    status: m.status,
    source: m.source,
    cycle: m.cycle,
    lastMessageAt: m.lastMessageAt,
    gaps: m.gaps,
    totalGaps: m.totalGaps,
    messagesReceivedCount: m.messagesReceivedCount,
    providerMountedAt: m.providerMountedAt,
  };
}

// v4.0 — eventos de dosagem (FIFO 50, mais recente em [0]).
export function useDosingEvents(): DoseEvent[] {
  return useMqtt().dosingEvents;
}

// v4.0 — estado do controle. Vem do tópico retain `control/state` (chega
// imediato após subscribe), com fallback para o snapshot embutido em `data`.
// Razão do fallback: control/state só é re-publicado em mudanças; se o
// dashboard sobe APÓS o último mode-change e o broker dropou a retained
// (raro mas acontece), o consumer ainda tem o estado mais recente do `data`.
export function useControlState(): ControlStateMessage | null {
  const m = useMqtt();
  if (m.controlState) return m.controlState;
  const d = m.data;
  if (!d || d.mode === undefined || d.estop === undefined) return null;
  return {
    mode: d.mode,
    estop: d.estop,
    dose_in_progress: d.dose_in_progress ?? null,
    t: m.lastMessageAt ?? Date.now(),
  };
}

// v4.0 — última telemetria técnica. Null = firmware ainda não publicou
// (placeholders da aba Diagnóstico continuam como "aguardando firmware").
export function useSystemHealth(): SystemHealthMessage | null {
  return useMqtt().systemHealth;
}

// v4.0 — atalho semântico. Centraliza a regra "estamos dosando agora?"
// para o header / cards de parâmetro. Lê do controlState (mais autoritativo
// que `data`, pois é evento real e não snapshot 5s atrasado).
export function useDoseInProgress(): DoseChemical | null {
  return useControlState()?.dose_in_progress ?? null;
}