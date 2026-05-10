import type { CredentialLifecycleState, StudentRecord } from "../api/types";

export const SIMULATED_STUDENT_RECORDS_SYSTEM = "UCT student records system (simulated)";
export const SIMULATED_STUDENT_COHORT_ID = "simulated-2026-cohort";
export const SIMULATED_STUDENT_RECORD_COUNT = 100;

type IssuanceSelectionOptions = {
  cohortId?: string;
  limit?: number;
};

const INSTITUTION = "University of Cape Town";
const VALID_FROM = "2026-01-01T00:00:00Z";
const EXPIRES_AT = "2026-12-31T23:59:59Z";
const ISSUANCE_STATES = new Set<CredentialLifecycleState>(["Pending", "Issuing"]);
const PENDING_ISSUANCE_START = 100;
const CALEB_DEMO_INDEX = 100;
const CALEB_EMAIL = "caleb.voskuil@gmail.com";

const facultyProgrammes: Record<string, string[]> = {
  Commerce: [
    "Bachelor of Commerce",
    "Bachelor of Business Science",
    "Bachelor of Accounting",
    "Postgraduate Diploma in Accounting",
    "Master of Commerce in Finance",
  ],
  Science: [
    "Bachelor of Science",
    "BSc Honours in Computer Science",
    "Bachelor of Science in Data Science",
    "Master of Science in Bioinformatics",
    "Doctor of Philosophy in Physics",
  ],
  Engineering: [
    "BSc Engineering (Electrical)",
    "BSc Engineering (Mechanical)",
    "BSc Engineering (Civil)",
    "BSc Engineering (Chemical)",
    "Master of Science in Engineering",
  ],
  "Health Sciences": [
    "MBChB",
    "Bachelor of Pharmacy",
    "Bachelor of Physiotherapy",
    "Bachelor of Nursing",
    "Master of Science in Medicine",
  ],
  Law: [
    "Bachelor of Laws (LLB)",
    "Bachelor of Arts and Law",
    "Master of Laws (LLM)",
    "Doctor of Laws (LLD)",
  ],
  Humanities: [
    "Bachelor of Arts",
    "Bachelor of Social Science",
    "BA in Film & Media Production",
    "Master of Arts in African Studies",
    "Bachelor of Education",
  ],
};

const firstNames = [
  "Sipho",
  "Kayla",
  "Tariq",
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
  if (index === CALEB_DEMO_INDEX) {
    return CALEB_EMAIL;
  }

  const safeName = `${firstName}.${lastName}`.replace(/[^a-z0-9.]/gi, "").toLowerCase();
  return `${safeName}.${padded(index)}@students.uct.ac.za`;
}

function lifecycleStateFor(index: number): CredentialLifecycleState {
  return index >= PENDING_ISSUANCE_START ? "Pending" : "Active";
}

function buildStudentRecord(index: number): StudentRecord {
  const facultyNames = Object.keys(facultyProgrammes);
  const faculty = facultyNames[(index - 1) % facultyNames.length];
  const programmes = facultyProgrammes[faculty];
  const programme = programmes[(index - 1) % programmes.length];
  const firstName = index === CALEB_DEMO_INDEX ? "Caleb" : firstNames[(index - 1) % firstNames.length];
  const lastName = index === CALEB_DEMO_INDEX ? "Voskuil" : lastNames[(index * 7 - 7) % lastNames.length];
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
  return student.credential.enrolmentStatus === "Registered" && ISSUANCE_STATES.has(student.credential.lifecycleState);
}

export function selectStudentRecordsForCredentialIssuance(
  studentRecords: StudentRecord[] = simulatedStudentRecords,
  { cohortId = SIMULATED_STUDENT_COHORT_ID, limit = SIMULATED_STUDENT_RECORD_COUNT }: IssuanceSelectionOptions = {},
): StudentRecord[] {
  if (cohortId !== SIMULATED_STUDENT_COHORT_ID) {
    return [];
  }

  return clone(studentRecords.filter(isStudentRecordEligibleForCredentialIssuance).slice(0, limit));
}
