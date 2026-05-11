import { describe, expect, it } from "vitest";
import {
  getSimulatedUniversityStudentRecordById,
  getSimulatedUniversityStudentRecords,
  searchSimulatedUniversityStudentRecords,
  selectStudentRecordsForCredentialIssuance,
  SIMULATED_STUDENT_COHORT_ID,
  SIMULATED_STUDENT_RECORD_COUNT,
  SIMULATED_STUDENT_RECORDS_SYSTEM,
} from "@/lib/student-records/simulatedUniversityRecords";

describe("simulated university student records", () => {
  it("returns deterministic contract-shaped student records", () => {
    const students = getSimulatedUniversityStudentRecords();

    expect(SIMULATED_STUDENT_RECORDS_SYSTEM).toContain("simulated");
    expect(students).toHaveLength(SIMULATED_STUDENT_RECORD_COUNT);
    expect(students[0]).toMatchObject({
      profile: {
        email: "sipho.dlamini.001@students.uct.ac.za",
        firstName: "Sipho",
        id: "student-demo-001",
        institution: "University of Cape Town",
        lastName: "Dlamini",
      },
      credential: {
        faculty: "Commerce",
        holderName: "Sipho Dlamini",
        id: "credential-demo-001",
        lifecycleState: "Pending",
        studentNumber: "DLASIP001",
      },
    });
  });

  it("supports lookup and search by university record details", () => {
    const student = getSimulatedUniversityStudentRecordById("student-demo-100");

    expect(student?.credential.lifecycleState).toBe("Pending");
    expect(student?.profile.email).toBe("caleb.voskuil@gmail.com");
    expect(searchSimulatedUniversityStudentRecords("Caleb Voskuil")).toHaveLength(1);
    expect(searchSimulatedUniversityStudentRecords("Sipho Dlamini").length).toBeGreaterThan(0);
    expect(searchSimulatedUniversityStudentRecords(student?.credential.studentNumber ?? "")).toHaveLength(1);
  });

  it("selects issuance-eligible records for the simulated cohort", () => {
    const selected = selectStudentRecordsForCredentialIssuance(undefined, {
      cohortId: SIMULATED_STUDENT_COHORT_ID,
      limit: SIMULATED_STUDENT_RECORD_COUNT,
    });

    expect(selected).toHaveLength(SIMULATED_STUDENT_RECORD_COUNT);
    expect(selected[0].profile.id).toBe("student-demo-001");
    expect(selected[SIMULATED_STUDENT_RECORD_COUNT - 1].profile.id).toBe("student-demo-100");
    expect(selectStudentRecordsForCredentialIssuance(undefined, { cohortId: "unknown-cohort" })).toEqual([]);
  });
});
