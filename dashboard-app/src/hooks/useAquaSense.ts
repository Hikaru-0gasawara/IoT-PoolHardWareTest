// Hooks tipados que expõem os dados do firmware AquaSense para os componentes.
// Eles leem do MqttProvider (fonte real) e caem no poolStore (mock simulado)
// como fallback. A UI nunca precisa saber qual é a origem.

import { useMqtt } from "@/providers/MqttProvider";
import { usePoolStore } from "@/store/poolStore";
import type {
  AquaSenseData,
  DataSource,
  DosingResponse,
  MqttConnectionStatus,
  PumpState,
  Temperatures,
  WaterQuality,
} from "@/types/firmware";

function buildFromStore(): AquaSenseData {
  const s = usePoolStore.getState();
  const wq: WaterQuality = {
    ph: s.ph,
    ph_status: s.ph < 7.2 ? "BAIXO" : s.ph > 7.6 ? "ALTO" : "OK",
    cloro: s.cloro,
    cloro_status: s.cloro < 1.0 ? "BAIXO" : s.cloro > 3.0 ? "ALTO" : "OK",
    alcalinidade: s.alcalinidade,
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
      .map(
        (a) =>
          `${a.parametro} ${a.severity === "crit" ? "crítico" : "atenção"}: ${a.valor_atual.toFixed(2)}${a.unidade ? " " + a.unidade : ""}`,
      ),
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

// Respostas de dosagem recebidas em aquasense-ibmec/alexa/resposta
// (FIFO, mais recente em [0]).
export function useDosingResponses(): DosingResponse[] {
  return useMqtt().dosingResponses;
}

// Publica um comando de dosagem manual. Throttle de 1s; rejeita quando
// desconectado. Gera comando_id automaticamente.
export function usePublishDosingCommand() {
  return useMqtt().publishDosingCommand;
}

// Publica o modo da bomba de aquecimento solar (controle/modo). Throttle de 1s.
export function usePublishControlMode() {
  return useMqtt().publishControlMode;
}

// Publica o modo da dosagem química (controle/dosagem/modo). Throttle de 1s.
export function usePublishDosingMode() {
  return useMqtt().publishDosingMode;
}
