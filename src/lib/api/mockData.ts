import type {
  BatchIssuancePreview,
  EligibilityRule,
  StudentRecord,
} from "@/lib/api/types";
import {
  getSimulatedUniversityStudentRecords,
  SIMULATED_STUDENT_COHORT_ID,
  SIMULATED_STUDENT_RECORD_COUNT,
} from "@/lib/student-records/simulatedUniversityRecords";

export const mockStudents: StudentRecord[] = getSimulatedUniversityStudentRecords();

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

export const mockBatchIssuancePreview: BatchIssuancePreview = {
  batchId: "batch-001",
  cohortId: SIMULATED_STUDENT_COHORT_ID,
  requestedCount: SIMULATED_STUDENT_RECORD_COUNT,
  status: "Draft",
};
