import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCalibration } from "./useCalibration";

describe("useCalibration", () => {
  it("retorna defaults se localStorage vazio", () => {
    const ph = renderHook(() => useCalibration("ph"));
    const cl = renderHook(() => useCalibration("chlorine"));
    const al = renderHook(() => useCalibration("alkalinity"));
    expect(ph.result.current.value).toBe(7.4);
    expect(cl.result.current.value).toBe(2.0);
    expect(al.result.current.value).toBe(100);
    expect(ph.result.current.isCustom).toBe(false);
  });

  it("update() persiste em localStorage", () => {
    const spy = vi.spyOn(window.localStorage.__proto__, "setItem");
    const { result } = renderHook(() => useCalibration("ph"));
    act(() => result.current.update(7.55));
    expect(result.current.value).toBe(7.55);
    expect(result.current.isCustom).toBe(true);
    expect(spy).toHaveBeenCalledWith("aquasense.calibration.ph", "7.55");
    spy.mockRestore();
  });

  it("retorna valor armazenado se já existir", () => {
    window.localStorage.setItem("aquasense.calibration.ph", "7.5");
    const { result } = renderHook(() => useCalibration("ph"));
    expect(result.current.value).toBe(7.5);
    expect(result.current.isCustom).toBe(true);
  });
});
