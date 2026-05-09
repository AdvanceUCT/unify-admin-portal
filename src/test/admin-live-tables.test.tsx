import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuditTable } from "@/features/audit/AuditTable";
import { CredentialsTable } from "@/features/credentials/CredentialsTable";
import { StudentsTable } from "@/features/students/StudentsTable";
import {
  completeMockWalletActivation,
  getMockAdminState,
  queueMockBatchIssuance,
  resetMockActivationStore,
  resolveMockWalletActivation,
} from "@/lib/api/mockActivationStore";
import type { AdminState } from "@/lib/api/types";

function jsonResponse(state: AdminState) {
  return new Response(JSON.stringify(state), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
}

function mockAdminStateFetch(state: AdminState) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(state)));
}

function activatedState() {
  const queuedAt = new Date("2026-04-27T10:00:00Z");
  const queued = queueMockBatchIssuance(queuedAt);
  const token = new URL(queued.activationDeliveries[0].activationUrl).searchParams.get("token") ?? "";
  const resolved = resolveMockWalletActivation({ token }, queuedAt);

  if (!resolved.ok) {
    throw new Error(resolved.error);
  }

  completeMockWalletActivation(
    {
      activationId: resolved.data.activationId,
      credentialRecordId: "credential-record-demo",
      holderConnectionId: "connection-demo",
    },
    new Date("2026-04-27T10:05:00Z"),
  );

  return getMockAdminState();
}

describe("admin live tables", () => {
  afterEach(() => {
    cleanup();
    resetMockActivationStore();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("renders activated student state from admin state", () => {
    const state = activatedState();
    mockAdminStateFetch(state);
    const activatedDelivery = state.activationDeliveries.find((delivery) => delivery.activatedAt);
    const activatedStudent = state.students.find((student) => student.profile.id === activatedDelivery?.studentId);

    render(<StudentsTable initialState={state} />);

    expect(screen.getByText(activatedStudent?.credential.studentNumber ?? "")).toBeInTheDocument();
    expect(screen.getAllByText("Active").length).toBeGreaterThan(0);
  });

  it("renders activated credential and delivery metadata", () => {
    const state = activatedState();
    mockAdminStateFetch(state);
    const activatedDelivery = state.activationDeliveries.find((delivery) => delivery.activatedAt);
    const activatedStudent = state.students.find((student) => student.profile.id === activatedDelivery?.studentId);

    render(<CredentialsTable initialState={state} />);

    expect(screen.getByText(activatedStudent?.credential.studentNumber ?? "")).toBeInTheDocument();
    expect(screen.getAllByText("Active").length).toBeGreaterThan(0);
    expect(screen.getByText(/Activated .*2026/)).toBeInTheDocument();
  });

  it("renders credential activation audit events", () => {
    const state = activatedState();
    mockAdminStateFetch(state);

    render(<AuditTable initialState={state} />);

    expect(screen.getByText("Credential activated")).toBeInTheDocument();
    expect(screen.getAllByText("credential-demo-100").length).toBeGreaterThan(0);
  });

  it("does not poll admin state by default when server state is provided", async () => {
    vi.useFakeTimers();
    const state = activatedState();
    mockAdminStateFetch(state);

    render(<CredentialsTable initialState={state} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });

    expect(fetch).not.toHaveBeenCalled();
  });
});
