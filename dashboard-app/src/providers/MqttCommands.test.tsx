import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

// FORK PT — comandos publicam em tópicos PT com payloads PT.

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
  act(() => { handlers["connect"]?.forEach((fn) => fn()); });
}

beforeEach(() => {
  publishMock.mockClear();
  Object.keys(handlers).forEach((k) => delete handlers[k]);
});

describe("useMqttCommands — comandos PT (fork)", () => {
  it('publishMode("auto") publica {"modo":"automatico"} em controle/modo PT', async () => {
    const { result } = renderHook(() => ({ cmds: useMqttCommands(), state: useMqtt() }), { wrapper });
    simulateConnect();
    await waitFor(() => expect(result.current.state.status).toBe("connected"));

    await act(async () => { await result.current.cmds.publishMode("auto"); });

    expect(publishMock).toHaveBeenCalledTimes(1);
    const [topic, payload, opts] = publishMock.mock.calls[0];
    expect(topic).toBe("aquasense-ibmec-pt/controle/modo");
    expect(JSON.parse(payload as string)).toEqual({ modo: "automatico" });
    expect(opts).toMatchObject({ qos: 0, retain: false });
  });

  it('publishMode("manual") publica {"modo":"manual"} (igual em PT)', async () => {
    const { result } = renderHook(() => ({ cmds: useMqttCommands(), state: useMqtt() }), { wrapper });
    simulateConnect();
    await waitFor(() => expect(result.current.state.status).toBe("connected"));

    await act(async () => { await result.current.cmds.publishMode("manual"); });

    const [topic, payload] = publishMock.mock.calls[0];
    expect(topic).toBe("aquasense-ibmec-pt/controle/modo");
    expect(JSON.parse(payload as string)).toEqual({ modo: "manual" });
  });

  it('publishDosingCommand("cloro") publica {"parametro":"cloro"} em dosagem/comando PT', async () => {
    const { result } = renderHook(() => ({ cmds: useMqttCommands(), state: useMqtt() }), { wrapper });
    simulateConnect();
    await waitFor(() => expect(result.current.state.status).toBe("connected"));

    await act(async () => { await result.current.cmds.publishDosingCommand("cloro"); });

    expect(publishMock).toHaveBeenCalledTimes(1);
    const [topic, payload] = publishMock.mock.calls[0];
    expect(topic).toBe("aquasense-ibmec-pt/dosagem/comando");
    expect(JSON.parse(payload as string)).toEqual({ parametro: "cloro" });
  });

  it("throttle de 1s: 2 chamadas idênticas resultam em UM publish", async () => {
    const { result } = renderHook(() => ({ cmds: useMqttCommands(), state: useMqtt() }), { wrapper });
    simulateConnect();
    await waitFor(() => expect(result.current.state.status).toBe("connected"));

    await act(async () => {
      await result.current.cmds.publishMode("auto");
      await result.current.cmds.publishMode("auto");
    });

    expect(publishMock).toHaveBeenCalledTimes(1);
  });

  it("rejeita Promise quando MQTT desconectado", async () => {
    const { result } = renderHook(() => useMqttCommands(), { wrapper });
    await expect(result.current.publishMode("manual")).rejects.toThrow(/MQTT desconectado/i);
    expect(publishMock).not.toHaveBeenCalled();
  });
});
