import {
  mockBatchIssuancePreview,
  mockEligibilityRules,
  mockVendors,
} from "@/lib/api/mockData";
import { getMockAdminState } from "@/lib/api/mockActivationStore";
import type { AdminState, BatchIssuanceResult, StudentRecord } from "@/lib/api/types";

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
    throw new Error(`Mock API request failed with status ${response.status}.`);
  }

  return response.json() as Promise<T>;
}

async function apiFetch<T>(path: string): Promise<T> {
  const base =
    typeof window === "undefined"
      ? process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"
      : "";
  const res = await fetch(`${base}${path}`);
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

export async function queueBatchIssuance() {
  const base =
    typeof window === "undefined"
      ? process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"
      : "";
  const res = await fetch(`${base}/api/admin/credentials/batch-issue`, {
    method: "POST",
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Batch issuance failed with status ${res.status}.`);
  return res.json() as Promise<BatchIssuanceResult>;
}
