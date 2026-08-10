/**
 * @fileoverview Stable mock records used when the portal runs without its external services.
 * @module lib/api/mockData
 */

import type {
  BatchIssuancePreview,
  StudentRecord,
} from "@/lib/api/types";
import {
  getSimulatedUniversityStudentRecords,
  SIMULATED_STUDENT_COHORT_ID,
  SIMULATED_STUDENT_RECORD_COUNT,
} from "@/lib/student-records/simulatedUniversityRecords";

export const mockStudents: StudentRecord[] = getSimulatedUniversityStudentRecords();


export const mockBatchIssuancePreview: BatchIssuancePreview = {
  batchId: "batch-001",
  cohortId: SIMULATED_STUDENT_COHORT_ID,
  requestedCount: SIMULATED_STUDENT_RECORD_COUNT,
  status: "Draft",
};
