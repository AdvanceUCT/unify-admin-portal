import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useBatchPolling } from "@/features/credentials/useBatchPolling";

beforeEach(() => { vi.useFakeTimers(); vi.spyOn(document, "hidden", "get").mockReturnValue(false); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe("batch progress polling", () => {
  it("updates progress and stops polling on completion", async () => {
    const load = vi.fn().mockResolvedValue({ active: false, processed: 4 });
    const { result } = renderHook(() => useBatchPolling({ active: true, processed: 0 }, value => value.active, load, 3000));
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(result.current.value.processed).toBe(4);
    await act(async () => { await vi.advanceTimersByTimeAsync(9000); });
    expect(load).toHaveBeenCalledTimes(1);
  });
  it("keeps the previous view through errors and reconnects", async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ active: true, processed: 4 });
    const { result } = renderHook(() => useBatchPolling({ active: true, processed: 0 }, value => value.active, load, 3000));
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(result.current.value.processed).toBe(0);
    expect(result.current.pollError).toMatch(/Reconnecting/);
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(result.current.value.processed).toBe(4);
    expect(result.current.pollError).toBeNull();
  });
  it("pauses hidden tabs, refreshes on return, and aborts on unmount", async () => {
    let signal: AbortSignal | undefined;
    const load = vi.fn().mockImplementation((input: AbortSignal) => { signal = input; return new Promise(() => {}); });
    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    const { unmount } = renderHook(() => useBatchPolling({ active: true }, value => value.active, load, 3000));
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(load).not.toHaveBeenCalled();
    hidden.mockReturnValue(false);
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(load).toHaveBeenCalledTimes(1);
    unmount();
    expect(signal!.aborted).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(9000); });
    expect(load).toHaveBeenCalledTimes(1);
  });
});
