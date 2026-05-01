import type {
  AdminVendor,
  AuditEvent,
  BatchIssuancePreview,
  DashboardSummary,
  EligibilityRule,
  StudentRecord,
} from "@/lib/api/types";

export const mockStudents: StudentRecord[] = [
  {
    profile: {
      id: "student-demo-001",
      firstName: "Demo",
      lastName: "Student",
      institution: "University of Cape Town",
    },
    credential: {
      id: "credential-demo-001",
      holderName: "Demo Student",
      issuer: "University of Cape Town",
      faculty: "Commerce",
      programme: "Bachelor of Business Science",
      enrolmentStatus: "Registered",
      lifecycleState: "Active",
      studentNumber: "VSKCAL001",
      validFrom: "2026-01-01T00:00:00Z",
      expiresAt: "2026-12-31T23:59:59Z",
    },
  },
  {
    profile: {
      id: "student-demo-002",
      firstName: "Simulated Student",
      lastName: "Two",
      institution: "University of Cape Town",
    },
    credential: {
      id: "credential-demo-002",
      holderName: "Simulated Student Two",
      issuer: "University of Cape Town",
      faculty: "Science",
      programme: "Bachelor of Science",
      enrolmentStatus: "Registered",
      lifecycleState: "Offered",
      studentNumber: "VSKSIM002",
      validFrom: "2026-01-01T00:00:00Z",
      expiresAt: "2026-12-31T23:59:59Z",
    },
  },
];

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
  activeCredentials: 96,
  pendingIssuance: 4,
  vendorsPendingApproval: 1,
  auditEventsToday: mockAuditEvents.length,
};

export const mockBatchIssuancePreview: BatchIssuancePreview = {
  batchId: "batch-001",
  cohortId: "simulated-2026-cohort",
  requestedCount: 100,
  status: "Draft",
};
