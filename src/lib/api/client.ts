import {
  mockAuditEvents,
  mockBatchIssuancePreview,
  mockDashboardSummary,
  mockEligibilityRules,
  mockStudents,
  mockVendors,
} from "@/lib/api/mockData";

const wait = (durationMs = 50) => new Promise((resolve) => setTimeout(resolve, durationMs));

export async function getDashboardSummary() {
  await wait();
  return mockDashboardSummary;
}

export async function getStudents() {
  await wait();
  return mockStudents;
}

export async function getStudentById(studentId: string) {
  await wait();
  return mockStudents.find((student) => student.profile.id === studentId);
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
