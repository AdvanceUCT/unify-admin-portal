/*
 * This file was made by Claude to help create simulated student records for testing the app.
 * It creates sample students, their programme info, and credential
 * details so we can try issuing records without using real student data.
 */

import type { BatchIssuanceSelection, CredentialLifecycleState, StudentRecord } from "../api/types";
import { SIMULATED_FACULTY_PROGRAMMES } from "./facultyProgrammes";

export const SIMULATED_STUDENT_RECORDS_SYSTEM = "UCT student records system (simulated)";
export const SIMULATED_STUDENT_COHORT_ID = "simulated-2026-cohort";
export const SIMULATED_STUDENT_RECORD_COUNT = 100;

type IssuanceSelectionOptions = BatchIssuanceSelection;

const INSTITUTION = "University of Cape Town";
const VALID_FROM = "2026-01-01T00:00:00Z";
const EXPIRES_AT = "2026-12-31T23:59:59Z";
const JOSHUA_DEMO_INDEX = 100;
const JOSHUA_EMAIL = "joshuawood.dc@gmail.com";
const CALEB_DEMO_INDEX = 99;
const CALEB_EMAIL = "caleb.voskuil@gmail.com";

const firstNames = [
  "Sipho",
  "Kayla",
  "Tariq",
  "Joshua",
  "Chloe",
  "Zanele",
  "Sarah",
  "Bongani",
  "Anathi",
  "Thabo",
  "Priya",
  "Lethabo",
  "Minenhle",
  "Aarav",
  "Fatima",
  "Duan",
  "Naledi",
  "Liam",
  "Musa",
  "Zoey",
  "Kabelo",
];

const lastNames = [
  "Dlamini",
  "Scott",
  "Smith",
  "Wood",
  "Gumede",
  "Patel",
  "Mokoena",
  "Botha",
  "Du Toit",
  "Van Wyk",
  "Ngcobo",
  "Mazibuko",
  "Naidoo",
  "Muller",
  "Ndlovu",
  "Hendricks",
  "Jacobs",
  "Pretorius",
  "Smit",
  "Mkhize",
  "Zwane",
];

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function padded(value: number) {
  return String(value).padStart(3, "0");
}

function studentNumberFor(firstName: string, lastName: string, index: number) {
  const surnamePart = lastName.replace(/[^a-z]/gi, "").slice(0, 3).toUpperCase().padEnd(3, "X");
  const namePart = firstName.slice(0, 3).toUpperCase().padEnd(3, "X");
  return `${surnamePart}${namePart}${padded(index)}`;
}

function emailForStudent(firstName: string, lastName: string, index: number) {
  if (index === JOSHUA_DEMO_INDEX) {
    return JOSHUA_EMAIL;
  }

  if (index === CALEB_DEMO_INDEX) {
    return CALEB_EMAIL;
  }

  const safeName = `${firstName}.${lastName}`.replace(/[^a-z0-9.]/gi, "").toLowerCase();
  return `${safeName}.${padded(index)}@students.uct.ac.za`;
}

function lifecycleStateFor(_index: number): CredentialLifecycleState {
  return "NOT_ISSUED";
}

function buildStudentRecord(index: number): StudentRecord {
  const facultyNames = Object.keys(SIMULATED_FACULTY_PROGRAMMES);
  const faculty = facultyNames[(index - 1) % facultyNames.length];
  const programmes = SIMULATED_FACULTY_PROGRAMMES[faculty];
  const programme = programmes[(index - 1) % programmes.length];
  const firstName =
    index === JOSHUA_DEMO_INDEX
      ? "Joshua"
      : index === CALEB_DEMO_INDEX
        ? "Caleb"
        : firstNames[(index - 1) % firstNames.length];
  const lastName =
    index === JOSHUA_DEMO_INDEX
      ? "Wood"
      : index === CALEB_DEMO_INDEX
        ? "Voskuil"
        : lastNames[(index * 7 - 7) % lastNames.length];
  const idSuffix = padded(index);
  const studentNumber = studentNumberFor(firstName, lastName, index);

  return {
    profile: {
      email: emailForStudent(firstName, lastName, index),
      firstName,
      id: `student-demo-${idSuffix}`,
      institution: INSTITUTION,
      lastName,
    },
    credential: {
      enrolmentStatus: "Registered",
      expiresAt: EXPIRES_AT,
      faculty,
      holderName: `${firstName} ${lastName}`,
      id: `credential-demo-${idSuffix}`,
      issuer: INSTITUTION,
      lifecycleState: lifecycleStateFor(index),
      programme,
      studentNumber,
      validFrom: VALID_FROM,
    },
  };
}

const simulatedStudentRecords = Array.from(
  { length: SIMULATED_STUDENT_RECORD_COUNT },
  (_unused, index) => buildStudentRecord(index + 1),
);

function matchesQuery(student: StudentRecord, normalizedQuery: string) {
  const fullName = `${student.profile.firstName} ${student.profile.lastName}`;
  const searchableValues = [
    student.profile.firstName,
    student.profile.lastName,
    fullName,
    student.profile.institution,
    student.credential.faculty,
    student.credential.programme,
    student.credential.enrolmentStatus,
    student.credential.lifecycleState,
    student.credential.studentNumber,
  ];

  return searchableValues.some((value) => value?.toLowerCase().includes(normalizedQuery));
}

export function getSimulatedUniversityStudentRecords(): StudentRecord[] {
  return clone(simulatedStudentRecords);
}

export function getSimulatedUniversityStudentRecordById(studentId: string): StudentRecord | undefined {
  const student = simulatedStudentRecords.find((candidate) => candidate.profile.id === studentId);
  return student ? clone(student) : undefined;
}

export function searchSimulatedUniversityStudentRecords(query: string): StudentRecord[] {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return getSimulatedUniversityStudentRecords();
  }

  return clone(simulatedStudentRecords.filter((student) => matchesQuery(student, normalizedQuery)));
}

export function isStudentRecordEligibleForCredentialIssuance(student: StudentRecord) {
  return (
    student.credential.enrolmentStatus === "Registered" &&
    ["NOT_ISSUED", "FAILED", "REVOKED"].includes(student.credential.lifecycleState)
  );
}

export function selectStudentRecordsForCredentialIssuance(
  studentRecords: StudentRecord[] = simulatedStudentRecords,
  {
    cohortId = SIMULATED_STUDENT_COHORT_ID,
    credentialStatus,
    enrolmentStatus,
    faculty,
    limit = SIMULATED_STUDENT_RECORD_COUNT,
    programme,
  }: IssuanceSelectionOptions = {},
): StudentRecord[] {
  if (cohortId !== SIMULATED_STUDENT_COHORT_ID) {
    return [];
  }

  return clone(
    studentRecords
      .filter((student) => {
        const matchesEligibility = isStudentRecordEligibleForCredentialIssuance(student);
        const matchesFaculty = !faculty || student.credential.faculty === faculty;
        const matchesProgramme = !programme || student.credential.programme === programme;
        const matchesEnrolmentStatus =
          !enrolmentStatus || student.credential.enrolmentStatus === enrolmentStatus;
        const matchesCredentialStatus =
          !credentialStatus || student.credential.lifecycleState === credentialStatus;

        return (
          matchesEligibility &&
          matchesFaculty &&
          matchesProgramme &&
          matchesEnrolmentStatus &&
          matchesCredentialStatus
        );
      })
      .slice(0, limit),
  );
}
