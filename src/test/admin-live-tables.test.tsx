import { cleanup, render, screen } from "@testing-library/react";
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
  queueMockBatchIssuance(queuedAt);
  const resolved = resolveMockWalletActivation({ token: "mock-act-7MFK2Q9V" }, queuedAt);

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
    vi.unstubAllGlobals();
  });

  it("renders activated student state from admin state", () => {
    const state = activatedState();
    mockAdminStateFetch(state);

    render(<StudentsTable initialState={state} />);

    expect(screen.getByText("Simulated Student Two")).toBeInTheDocument();
    expect(screen.getAllByText("Active").length).toBeGreaterThan(0);
  });

  it("renders activated credential and delivery metadata", () => {
    const state = activatedState();
    mockAdminStateFetch(state);

    render(<CredentialsTable initialState={state} />);

    expect(screen.getByText("Simulated Student Two")).toBeInTheDocument();
    expect(screen.getAllByText("Active").length).toBeGreaterThan(0);
    expect(screen.getByText(/Activated .*2026/)).toBeInTheDocument();
  });

  it("renders credential activation audit events", () => {
    const state = activatedState();
    mockAdminStateFetch(state);

    render(<AuditTable initialState={state} />);

    expect(screen.getByText("Credential activated")).toBeInTheDocument();
    expect(screen.getAllByText("credential-demo-002").length).toBeGreaterThan(0);
  });
});
