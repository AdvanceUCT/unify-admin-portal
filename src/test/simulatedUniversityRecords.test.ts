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
        lifecycleState: "NOT_ISSUED",
        studentNumber: "DLASIP001",
      },
    });
  });

  it("supports lookup and search by university record details", () => {
    const joshua = getSimulatedUniversityStudentRecordById("student-demo-100");
    const caleb = getSimulatedUniversityStudentRecordById("student-demo-099");

    expect(joshua?.credential.lifecycleState).toBe("NOT_ISSUED");
    expect(joshua?.profile.email).toBe("joshuawood.dc@gmail.com");
    expect(searchSimulatedUniversityStudentRecords("Joshua Wood")).toHaveLength(1);
    expect(caleb?.profile).toMatchObject({
      email: "caleb.voskuil@gmail.com",
      firstName: "Caleb",
      lastName: "Voskuil",
    });
    expect(caleb?.credential.studentNumber).toBe("VOSCAL099");
    expect(searchSimulatedUniversityStudentRecords("Caleb Voskuil")).toHaveLength(1);
    expect(searchSimulatedUniversityStudentRecords("Sipho Dlamini").length).toBeGreaterThan(0);
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

  it("selects issuance-eligible records by faculty and programme", () => {
    const commerceStudents = selectStudentRecordsForCredentialIssuance(undefined, {
      cohortId: SIMULATED_STUDENT_COHORT_ID,
      faculty: "Commerce",
    });
    const accountingStudents = selectStudentRecordsForCredentialIssuance(undefined, {
      cohortId: SIMULATED_STUDENT_COHORT_ID,
      faculty: "Commerce",
      programme: "Bachelor of Accounting",
    });

    expect(commerceStudents.length).toBeGreaterThan(accountingStudents.length);
    expect(commerceStudents.every((student) => student.credential.faculty === "Commerce")).toBe(true);
    expect(accountingStudents.every((student) => student.credential.programme === "Bachelor of Accounting")).toBe(true);
  });

  it("keeps batch selection limited to credential issuance states", () => {
    const selected = selectStudentRecordsForCredentialIssuance(undefined, {
      cohortId: SIMULATED_STUDENT_COHORT_ID,
      credentialStatus: "ACTIVE",
    });

    expect(selected).toEqual([]);
  });
});
