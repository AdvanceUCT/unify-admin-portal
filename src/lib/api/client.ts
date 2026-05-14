import {
  mockBatchIssuancePreview,
  mockEligibilityRules,
  mockVendors,
} from "@/lib/api/mockData";
import {
  createMockBatchRun,
  getMockAdminState,
  getMockBatchRunDetail,
  listMockBatchRuns,
  previewMockBatchIssuance,
  queueMockBatchIssuance,
  retryMockBatchRun,
} from "@/lib/api/mockActivationStore";
import type {
  AdminState,
  BatchIssuancePreviewResult,
  BatchIssuanceResult,
  BatchIssuanceRunDetail,
  BatchIssuanceRunSummary,
  BatchIssuanceSelection,
  StudentRecord,
} from "@/lib/api/types";

const wait = (durationMs = 50) => new Promise((resolve) => setTimeout(resolve, durationMs));

function shouldUseMockApi() {
  return typeof window !== "undefined" && process.env.NODE_ENV !== "test";
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    cache: "no-store",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(body?.error?.message ?? `API request failed with status ${response.status}.`);
  }

  return response.json() as Promise<T>;
}

async function apiFetch<T>(path: string): Promise<T> {
  if (typeof window !== "undefined") {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
    return res.json() as Promise<T>;
  }

  const { headers } = await import("next/headers");
  const requestHeaders = await headers();
  const cookie = requestHeaders.get("cookie");
  const base = process.env.APP_URL ?? process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  const res = await fetch(`${base}${path}`, {
    headers: cookie ? { cookie } : undefined,
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

export async function getAdminState() {
  await wait();

  if (shouldUseMockApi()) {
    return fetchJson<AdminState>("/api/mock/admin-state");
  }

  return getMockAdminState();
}

export async function getDashboardSummary() {
  const state = await getAdminState();
  return state.dashboardSummary;
}

export async function getStudents(params?: { q?: string }) {
  const qs = params?.q ? `?${new URLSearchParams({ query: params.q }).toString()}` : "";
  return apiFetch<StudentRecord[]>(`/api/admin/students${qs}`);
}

export async function getStudentById(studentId: string) {
  try {
    return await apiFetch<StudentRecord>(`/api/admin/students/${studentId}`);
  } catch {
    return undefined;
  }
}

export async function getCredentials() {
  const state = await getAdminState();
  return state.credentials;
}

export async function getActivationDeliveries() {
  const state = await getAdminState();
  return state.activationDeliveries;
}

export async function getActivationDeliveryByCredentialId(credentialId: string) {
  const deliveries = await getActivationDeliveries();
  return deliveries.find((delivery) => delivery.credentialId === credentialId);
}

export async function getVendors() {
  await wait();
  return mockVendors;
}

export async function getEligibilityRules() {
  await wait();
  return mockEligibilityRules;
}

export async function getAuditEvents() {
  const state = await getAdminState();
  return state.auditEvents;
}

export async function getRecentAuditEvents() {
  const events = await getAuditEvents();
  return events.slice(0, 5);
}

export async function getBatchIssuancePreview() {
  await wait();
  return mockBatchIssuancePreview;
}

export async function queueBatchIssuance(selection: BatchIssuanceSelection = {}) {
  await wait();

  if (shouldUseMockApi()) {
    return fetchJson<BatchIssuanceResult>("/api/credentials/batch-issue", {
      body: JSON.stringify(selection),
      method: "POST",
    });
  }

  return queueMockBatchIssuance(selection);
}

export async function previewBatchIssuance(selection: BatchIssuanceSelection = {}) {
  await wait();

  if (shouldUseMockApi()) {
    return fetchJson<BatchIssuancePreviewResult>("/api/credentials/batch-preview", {
      body: JSON.stringify(selection),
      method: "POST",
    });
  }

  return previewMockBatchIssuance(selection);
}

export async function createBatchRun(selection: BatchIssuanceSelection = {}) {
  await wait();

  if (shouldUseMockApi()) {
    return fetchJson<BatchIssuanceRunDetail>("/api/credentials/batch-runs", {
      body: JSON.stringify(selection),
      method: "POST",
    });
  }

  return createMockBatchRun(selection);
}

export async function getBatchRuns() {
  await wait();

  if (shouldUseMockApi()) {
    return fetchJson<BatchIssuanceRunSummary[]>("/api/credentials/batch-runs");
  }

  return listMockBatchRuns();
}

export async function getBatchRunById(batchId: string) {
  if (typeof window !== "undefined" && process.env.NODE_ENV !== "test") {
    return fetchJson<BatchIssuanceRunDetail>(`/api/credentials/batch-runs/${encodeURIComponent(batchId)}`);
  }

  return getMockBatchRunDetail(batchId);
}

export async function retryFailedBatchRun(batchId: string) {
  if (typeof window !== "undefined" && process.env.NODE_ENV !== "test") {
    return fetchJson<BatchIssuanceRunDetail>(
      `/api/credentials/batch-runs/${encodeURIComponent(batchId)}/retry-failed`,
      { method: "POST" },
    );
  }

  return retryMockBatchRun(batchId);
}
