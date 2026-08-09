import { mockBatchIssuancePreview } from "@/lib/api/mockData";
import {
  createMockBatchRun,
  getMockAdminState,
  previewMockBatchIssuance,
  retryMockBatchRun,
} from "@/lib/api/mockActivationStore";
import type {
  AdminState,
  BatchIssuancePreviewResult,
  BatchIssuanceRunDetail,
  BatchIssuanceSelection,
  StudentRecord,
} from "@/lib/api/types";

const wait = (durationMs = 50) => new Promise((resolve) => setTimeout(resolve, durationMs));

/**
 * Returns true when running in the browser outside of tests.
 * In that case API calls go to real Next.js route handlers rather than
 * calling mock store functions directly.
 */
function shouldUseMockApi() {
  return typeof window !== "undefined" && process.env.NODE_ENV !== "test";
}

function toHttpsOrigin(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  return value.startsWith("http://") || value.startsWith("https://")
    ? value
    : `https://${value}`;
}

function firstHeaderValue(value: string | null) {
  return value?.split(",")[0]?.trim() || undefined;
}

function requestOriginFromHeaders(requestHeaders: Headers) {
  const host = firstHeaderValue(requestHeaders.get("x-forwarded-host")) ?? firstHeaderValue(requestHeaders.get("host"));
  if (!host) {
    return undefined;
  }

  const forwardedProto = firstHeaderValue(requestHeaders.get("x-forwarded-proto"));
  const protocol = forwardedProto ?? (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  return `${protocol}://${host}`;
}

export const __apiClientTestInternals = {
  requestOriginFromHeaders,
  toHttpsOrigin,
};

/**
 * Fetch wrapper that parses the response as JSON and throws on non-2xx responses.
 * Tries to pull the error message from `body.error.message` before falling back
 * to a generic status message.
 */
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

/**
 * Fetches an internal API route from both client and server contexts.
 * On the server it constructs an absolute URL and forwards the session cookie
 * so authenticated routes work correctly during SSR.
 */
async function apiFetch<T>(path: string): Promise<T> {
  if (typeof window !== "undefined") {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
    return res.json() as Promise<T>;
  }

  const { headers } = await import("next/headers");
  const requestHeaders = await headers();
  const cookie = requestHeaders.get("cookie");
  const base =
    requestOriginFromHeaders(requestHeaders) ??
    toHttpsOrigin(process.env.VERCEL_URL) ??
    process.env.APP_URL ??
    process.env.BETTER_AUTH_URL ??
    "http://localhost:3000";
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

export async function getActivationDeliveries() {
  const state = await getAdminState();
  return state.activationDeliveries;
}

export async function getAuditEvents() {
  const state = await getAdminState();
  return state.auditEvents;
}

export async function getBatchIssuancePreview() {
  await wait();
  return mockBatchIssuancePreview;
}

export async function previewBatchIssuance(selection: BatchIssuanceSelection = {}) {
  await wait();

  if (shouldUseMockApi()) {
    return fetchJson<BatchIssuancePreviewResult>("/api/credentials/issuance/batch/preview", {
      body: JSON.stringify(selection),
      method: "POST",
    });
  }

  return previewMockBatchIssuance(selection);
}

export async function createBatchRun(selection: BatchIssuanceSelection = {}) {
  await wait();

  if (shouldUseMockApi()) {
    return fetchJson<BatchIssuanceRunDetail>("/api/credentials/issuance/batch/runs", {
      body: JSON.stringify(selection),
      method: "POST",
    });
  }

  return createMockBatchRun(selection);
}

export async function retryFailedBatchRun(batchId: string) {
  if (typeof window !== "undefined" && process.env.NODE_ENV !== "test") {
    return fetchJson<BatchIssuanceRunDetail>(
      `/api/credentials/issuance/batch/runs/${encodeURIComponent(batchId)}/retry-failed`,
      { method: "POST" },
    );
  }

  return retryMockBatchRun(batchId);
}
