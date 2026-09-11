import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { checkAgentHealthActionMock } = vi.hoisted(() => ({
  checkAgentHealthActionMock: vi.fn(),
}));

vi.mock("@/app/(admin)/settings/actions", () => ({
  checkAgentHealthAction: checkAgentHealthActionMock,
}));

import { AgentStatusIndicator } from "@/features/agent/AgentStatusIndicator";
import { LiveVerificationList } from "@/features/vendors/LiveVerificationList";
import { LiveVerificationNotifications } from "@/features/vendors/LiveVerificationNotifications";
import type { AgentHealth } from "@/lib/agentClient";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, reject, resolve };
}

function setVisibilityState(value: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value,
  });
}

function okJson<T>(payload: T) {
  return {
    json: async () => payload,
    ok: true,
  } as Response;
}

const pendingVerification = {
  attributes: null,
  branchId: "branch_1",
  checkoutId: "checkout_1",
  completedAt: null,
  createdAt: "2026-09-10T10:00:00.000Z",
  failureCode: null,
  failureReason: null,
  id: "verification_1",
  isVerified: null,
  latestDeliveryStatus: null,
  servicePointName: "Main branch",
  status: "PENDING" as const,
  student: {
    id: "S100",
    name: "Jane Student",
    university: "University of Example",
  },
  verificationRequestId: "request_1",
};

beforeEach(() => {
  vi.useFakeTimers();
  setVisibilityState("visible");
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  setVisibilityState("visible");
});

describe("AgentStatusIndicator polling", () => {
  it("keeps one health check in flight and skips hidden-tab interval work", async () => {
    const firstHealth = deferred<AgentHealth>();
    const secondHealth = deferred<AgentHealth>();
    const checkHealth = vi
      .fn<() => Promise<AgentHealth>>()
      .mockReturnValueOnce(firstHealth.promise)
      .mockReturnValueOnce(secondHealth.promise);

    render(<AgentStatusIndicator checkHealth={checkHealth} />);

    expect(checkHealth).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });
    expect(checkHealth).toHaveBeenCalledTimes(1);

    await act(async () => {
      firstHealth.resolve({
        checkedAt: new Date().toISOString(),
        ok: true,
        reachable: true,
        status: "ready",
      });
      await Promise.resolve();
    });
    expect(screen.getByText("Connected")).toBeInTheDocument();

    setVisibilityState("hidden");
    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });
    expect(checkHealth).toHaveBeenCalledTimes(1);

    setVisibilityState("visible");
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(checkHealth).toHaveBeenCalledTimes(2);

    await act(async () => {
      secondHealth.resolve({
        checkedAt: new Date().toISOString(),
        ok: false,
        error: "Network failed",
      });
      await Promise.resolve();
    });
    expect(screen.getByText("Offline")).toBeInTheDocument();
  });
});

describe("live verification polling", () => {
  it("bounds notification polls, preserves branch scope, and advances the cursor after success", async () => {
    const firstResponse = deferred<Response>();
    const secondResponse = deferred<Response>();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockReturnValueOnce(firstResponse.promise)
      .mockReturnValueOnce(secondResponse.promise);
    vi.stubGlobal("fetch", fetchMock);

    render(
      <LiveVerificationNotifications
        branchIds={["branch_1", "branch_2"]}
        initialCursor="cursor_1"
      />,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("cursor=cursor_1");
    expect(String(fetchMock.mock.calls[0][0])).toContain("branchId=branch_1");
    expect(String(fetchMock.mock.calls[0][0])).toContain("branchId=branch_2");

    await act(async () => {
      vi.advanceTimersByTime(2_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      firstResponse.resolve(okJson({ events: [], nextCursor: "cursor_2" }));
      await Promise.resolve();
    });

    await act(async () => {
      vi.advanceTimersByTime(2_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toContain("cursor=cursor_2");

    secondResponse.resolve(okJson({ events: [], nextCursor: "cursor_3" }));
  });

  it("skips hidden pending-item polls until the tab becomes visible", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      okJson({
        ...pendingVerification,
        completedAt: "2026-09-10T10:01:00.000Z",
        isVerified: true,
        status: "APPROVED",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    setVisibilityState("hidden");

    render(<LiveVerificationList initialItems={[pendingVerification]} />);

    await act(async () => {
      vi.advanceTimersByTime(2_000);
    });
    expect(fetchMock).not.toHaveBeenCalled();

    setVisibilityState("visible");
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByText("APPROVED")).toBeInTheDocument();
  });

  it("keeps one pending-item poll in flight and aborts stale work on unmount", async () => {
    const response = deferred<Response>();
    const fetchMock = vi.fn<typeof fetch>().mockReturnValue(response.promise);
    vi.stubGlobal("fetch", fetchMock);

    render(<LiveVerificationList initialItems={[pendingVerification]} />);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const signal = (fetchMock.mock.calls[0][1] as RequestInit).signal as AbortSignal;

    await act(async () => {
      vi.advanceTimersByTime(2_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    cleanup();
    expect(signal.aborted).toBe(true);

    response.resolve(okJson(pendingVerification));
  });
});
