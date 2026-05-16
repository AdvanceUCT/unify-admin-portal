import type { StudentRecord } from "@/lib/api/types";
import { getMockAdminState } from "@/lib/api/mockActivationStore";
import db from "./database";
import { seedDatabase } from "./seed";

function matchesStudentQuery(student: StudentRecord, normalizedQuery: string) {
  const fullName = `${student.profile.firstName} ${student.profile.lastName}`;
  return [
    student.profile.email,
    student.profile.firstName,
    student.profile.lastName,
    fullName,
    student.credential.studentNumber,
  ].some((value) => value.toLowerCase().includes(normalizedQuery));
}

function rowToStudentRecord(row: Record<string, unknown>): StudentRecord {
  return {
    profile: {
      email: (row.email as string | undefined) || `${row.id as string}@students.uct.ac.za`,
      id: row.id as string,
      firstName: row.firstName as string,
      lastName: row.lastName as string,
      institution: "University of Cape Town",
    },
    credential: {
      id: row.id as string,
      holderName: `${row.firstName as string} ${row.lastName as string}`,
      issuer: "University of Cape Town",
      faculty: row.faculty as string,
      programme: row.programme as string,
      enrolmentStatus: "Registered",
      lifecycleState: "NOT_ISSUED",
      studentNumber: row.student_number as string,
      validFrom: "2026-01-01T00:00:00Z",
      expiresAt: `${row.expires_at as string}T00:00:00Z`,
    },
  };
}

async function init() {
  if (!db) {
    return;
  }

  await db.execute(`
    CREATE TABLE IF NOT EXISTS students (
      id TEXT PRIMARY KEY,
      firstName TEXT NOT NULL,
      lastName TEXT NOT NULL,
      email TEXT NOT NULL DEFAULT '',
      student_number TEXT UNIQUE NOT NULL,
      faculty TEXT NOT NULL,
      programme TEXT NOT NULL,
      lifecycle_state TEXT NOT NULL,
      expires_at TEXT NOT NULL
    )
  `);
  await db.execute("ALTER TABLE students ADD COLUMN email TEXT NOT NULL DEFAULT ''").catch(() => undefined);
  await seedDatabase(db);
}

const initPromise = db ? init() : Promise.resolve();

export async function getAllStudents(): Promise<StudentRecord[]> {
  if (!db) {
    return getMockAdminState().students;
  }

  await initPromise;
  const result = await db.execute("SELECT * FROM students");
  return result.rows.map((row) => rowToStudentRecord(row as Record<string, unknown>));
}

export async function getStudentById(id: string): Promise<StudentRecord | undefined> {
  if (!db) {
    return getMockAdminState().students.find((student) => student.profile.id === id);
  }

  await initPromise;
  const result = await db.execute({
    sql: "SELECT * FROM students WHERE id = ?",
    args: [id]
  });
  const row = result.rows[0];
  return row ? rowToStudentRecord(row as Record<string, unknown>) : undefined;
}

export async function searchStudents(query: string): Promise<StudentRecord[]> {
  if (!db) {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return getMockAdminState().students;
    }

    return getMockAdminState().students.filter((student) => matchesStudentQuery(student, normalizedQuery));
  }

  await initPromise;
  const pattern = `%${query}%`;
  const result = await db.execute({
    sql: `SELECT * FROM students 
          WHERE firstName LIKE ? 
          OR lastName LIKE ? 
          OR email LIKE ?
          OR student_number LIKE ?
          OR (firstName || ' ' || lastName) LIKE ?`,
    args: [pattern, pattern, pattern, pattern, pattern]
  });
  return result.rows.map((row) => rowToStudentRecord(row as Record<string, unknown>));
}

export async function updateStudentStatus(id: string, status: string) {
  if (!db) {
    return;
  }

  await initPromise;
  await db.execute({
    sql: "UPDATE students SET lifecycle_state = ? WHERE id = ?",
    args: [status, id]
  });
}
