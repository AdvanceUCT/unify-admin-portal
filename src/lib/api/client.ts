import {
  mockAuditEvents,
  mockBatchIssuancePreview,
  mockDashboardSummary,
  mockEligibilityRules,
  mockStudents,
  mockVendors,
} from "@/lib/api/mockData";

import type { StudentRecord } from "@/lib/api/types";

const wait = (durationMs = 50) => new Promise((resolve) => setTimeout(resolve, durationMs));

async function apiFetch<T>(path: string): Promise<T> {
  const base =
    typeof window === "undefined"
      ? process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"
      : "";
  const res = await fetch(`${base}${path}`);
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

export async function getDashboardSummary() {
  await wait();
  return mockDashboardSummary;
}

export async function getStudents(params?: { q?: string }) {
  const qs = params?.q ? `?query=${params.q}` : "";
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
  await wait();
  return mockStudents.map((student) => student.credential);
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
  await wait();
  return mockAuditEvents;
}

export async function getRecentAuditEvents() {
  await wait();
  return mockAuditEvents.slice(0, 5);
}

export async function getBatchIssuancePreview() {
  await wait();
  return mockBatchIssuancePreview;
}
