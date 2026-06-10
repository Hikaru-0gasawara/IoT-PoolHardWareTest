import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

// Comandos de dosagem manual — firmware ESP32 AquaSense v3.0.
// O dashboard publica em aquasense-ibmec-pt/dosagem/comando com payload
// { parametro, origem, comando_id }. Throttle de 1s; rejeita quando desconectado.

const handlers: Record<string, ((...args: unknown[]) => void)[]> = {};
const publishMock = vi.fn(
  (_topic: string, _payload: string, _opts: unknown, cb?: (err?: Error | null) => void) => {
    cb?.(null);
  },
);

const fakeClient = {
  on: (event: string, fn: (...args: unknown[]) => void) => {
    (handlers[event] ||= []).push(fn);
  },
  subscribe: (_t: string, _o: unknown, cb?: (err?: Error | null) => void) => cb?.(null),
  publish: publishMock,
  end: vi.fn(),
};

vi.mock("mqtt", () => ({
  default: { connect: vi.fn(() => fakeClient) },
}));

import { MqttProvider, useMqttCommands, useMqtt } from "./MqttProvider";

const wrapper = ({ children }: { children: ReactNode }) => <MqttProvider>{children}</MqttProvider>;

function simulateConnect() {
  act(() => {
    handlers["connect"]?.forEach((fn) => fn());
  });
}

beforeEach(() => {
  publishMock.mockClear();
  Object.keys(handlers).forEach((k) => delete handlers[k]);
});

describe("useMqttCommands — comandos de dosagem (firmware v3.0)", () => {
  it('publishDosingCommand("cloro") publica em aquasense-ibmec-pt/dosagem/comando', async () => {
    const { result } = renderHook(() => ({ cmds: useMqttCommands(), state: useMqtt() }), {
      wrapper,
    });
    simulateConnect();
    await waitFor(() => expect(result.current.state.status).toBe("connected"));

    await act(async () => {
      await result.current.cmds.publishDosingCommand("cloro");
    });

    expect(publishMock).toHaveBeenCalledTimes(1);
    const [topic, payload, opts] = publishMock.mock.calls[0];
    expect(topic).toBe("aquasense-ibmec-pt/dosagem/comando");
    const parsed = JSON.parse(payload as string);
    expect(parsed).toMatchObject({ parametro: "cloro", origem: "manual" });
    expect(typeof parsed.comando_id).toBe("string");
    expect(parsed.comando_id.length).toBeGreaterThan(0);
    expect(opts).toMatchObject({ qos: 1, retain: false });
  });

  it("publishDosingCommand gera um comando_id único por chamada", async () => {
    const { result } = renderHook(() => ({ cmds: useMqttCommands(), state: useMqtt() }), {
      wrapper,
    });
    simulateConnect();
    await waitFor(() => expect(result.current.state.status).toBe("connected"));

    await act(async () => {
      await result.current.cmds.publishDosingCommand("cloro");
    });
    await act(async () => {
      await result.current.cmds.publishDosingCommand("acido");
    });

    expect(publishMock).toHaveBeenCalledTimes(2);
    const id1 = JSON.parse(publishMock.mock.calls[0][1] as string).comando_id;
    const id2 = JSON.parse(publishMock.mock.calls[1][1] as string).comando_id;
    expect(id1).not.toBe(id2);
    expect(JSON.parse(publishMock.mock.calls[1][1] as string).parametro).toBe("acido");
  });

  it("aceita os 3 produtos (cloro|acido|base)", async () => {
    const { result } = renderHook(() => ({ cmds: useMqttCommands(), state: useMqtt() }), {
      wrapper,
    });
    simulateConnect();
    await waitFor(() => expect(result.current.state.status).toBe("connected"));

    await act(async () => {
      await result.current.cmds.publishDosingCommand("base");
    });
    expect(JSON.parse(publishMock.mock.calls[0][1] as string).parametro).toBe("base");
  });

  it("throttle de 1s: a 2ª dose idêntica é rejeitada e só UM publish ocorre", async () => {
    const { result } = renderHook(() => ({ cmds: useMqttCommands(), state: useMqtt() }), {
      wrapper,
    });
    simulateConnect();
    await waitFor(() => expect(result.current.state.status).toBe("connected"));

    await act(async () => {
      await result.current.cmds.publishDosingCommand("cloro");
    });
    await act(async () => {
      await expect(result.current.cmds.publishDosingCommand("cloro")).rejects.toThrow(/aguarde/i);
    });

    expect(publishMock).toHaveBeenCalledTimes(1);
  });

  it("rejeita Promise quando MQTT desconectado", async () => {
    const { result } = renderHook(() => useMqttCommands(), { wrapper });
    await expect(result.current.publishDosingCommand("cloro")).rejects.toThrow(
      /MQTT desconectado/i,
    );
    expect(publishMock).not.toHaveBeenCalled();
  });
});
