import type {
  ActivationDelivery,
  AdminVendor,
  AuditEvent,
  BatchIssuancePreview,
  DashboardSummary,
  EligibilityRule,
  StudentRecord,
} from "@/lib/api/types";
import {
  getSimulatedUniversityStudentRecords,
  isStudentRecordEligibleForCredentialIssuance,
  SIMULATED_STUDENT_COHORT_ID,
  SIMULATED_STUDENT_RECORD_COUNT,
} from "@/lib/student-records/simulatedUniversityRecords";

export const mockStudents: StudentRecord[] = getSimulatedUniversityStudentRecords();

export const mockVendors: AdminVendor[] = [
  {
    id: "vendor-001",
    name: "Library Cafe",
    serviceCategory: "Food service",
    status: "Approved",
  },
  {
    id: "vendor-002",
    name: "Campus Shuttle",
    serviceCategory: "Transport",
    status: "Pending",
  },
];

export const mockEligibilityRules: EligibilityRule[] = [
  {
    id: "rule-001",
    name: "Active enrolment required",
    appliesTo: "All service points",
    description: "Student credential lifecycle state must be Active before access is approved.",
  },
  {
    id: "rule-002",
    name: "Registered students only",
    appliesTo: "Payment authorization",
    description: "Wallet payments are limited to students with Registered enrolment status.",
  },
];

export const mockAuditEvents: AuditEvent[] = [
  {
    id: "audit-001",
    eventType: "CredentialIssued",
    actorId: "admin-demo-001",
    targetId: "credential-demo-001",
    result: "Success",
    occurredAt: "2026-04-21T07:30:00Z",
    reason: "Initial simulated cohort issuance",
  },
  {
    id: "audit-002",
    eventType: "CredentialVerified",
    actorId: "vendor-001",
    targetId: "credential-demo-001",
    servicePointId: "library-cafe",
    vendorId: "vendor-001",
    result: "Success",
    occurredAt: "2026-04-21T08:15:00Z",
  },
];

export const mockDashboardSummary: DashboardSummary = {
  activeCredentials: mockStudents.filter((student) => student.credential.lifecycleState === "Active").length,
  pendingIssuance: mockStudents.filter(isStudentRecordEligibleForCredentialIssuance).length,
  vendorsPendingApproval: 1,
  auditEventsToday: mockAuditEvents.length,
};

export const mockBatchIssuancePreview: BatchIssuancePreview = {
  batchId: "batch-001",
  cohortId: SIMULATED_STUDENT_COHORT_ID,
  requestedCount: SIMULATED_STUDENT_RECORD_COUNT,
  eligibleCount: SIMULATED_STUDENT_RECORD_COUNT,
  pendingCount: SIMULATED_STUDENT_RECORD_COUNT,
  issuingCount: 0,
  totalStudents: SIMULATED_STUDENT_RECORD_COUNT,
  faculties: ["Commerce", "Science", "Engineering", "Health Sciences", "Law", "Humanities"],
  status: "Draft",
};

export const mockActivationDeliveries: ActivationDelivery[] = [];
