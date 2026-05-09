import type { StudentRecord } from "@/lib/api/types";
import {
  getSimulatedUniversityStudentRecordById,
  getSimulatedUniversityStudentRecords,
  searchSimulatedUniversityStudentRecords,
} from "@/lib/student-records/simulatedUniversityRecords";
import db from "./database";
import { seedDatabase } from "./seed";
import { prisma } from "@/lib/db/prisma";

function rowToStudentRecord(row: Record<string, unknown>): StudentRecord {
  return {
    profile: {
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
      lifecycleState: row.lifecycle_state as StudentRecord["credential"]["lifecycleState"],
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
      student_number TEXT UNIQUE NOT NULL,
      faculty TEXT NOT NULL,
      programme TEXT NOT NULL,
      lifecycle_state TEXT NOT NULL,
      expires_at TEXT NOT NULL
    )
  `);
  await seedDatabase(db);
}

const initPromise = db ? init() : Promise.resolve();

export async function getAllStudents(): Promise<StudentRecord[]> {
  if (!db) {
    return getSimulatedUniversityStudentRecords();
  }

  await initPromise;
  const result = await db.execute("SELECT * FROM students");
  return result.rows.map((row) => rowToStudentRecord(row as Record<string, unknown>));
}

export async function getStudentById(id: string): Promise<StudentRecord | undefined> {
  if (!db) {
    return getSimulatedUniversityStudentRecordById(id);
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
    return searchSimulatedUniversityStudentRecords(query);
  }

  await initPromise;
  const pattern = `%${query}%`;
  const result = await db.execute({
    sql: `SELECT * FROM students 
          WHERE firstName LIKE ? 
          OR lastName LIKE ? 
          OR student_number LIKE ?
          OR (firstName || ' ' || lastName) LIKE ?`,
    args: [pattern, pattern, pattern, pattern]
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

function prismaRowToStudentRecord(row: {
  id: string;
  firstName: string;
  lastName: string;
  studentNumber: string;
  faculty: string;
  programme: string;
  enrolmentStatus: string;
  lifecycleState: string;
  validFrom: string;
  expiresAt: string;
  institution: string;
}): StudentRecord {
  return {
    profile: {
      id: row.id,
      firstName: row.firstName,
      lastName: row.lastName,
      institution: row.institution,
    },
    credential: {
      id: row.id,
      holderName: `${row.firstName} ${row.lastName}`,
      issuer: row.institution,
      faculty: row.faculty,
      programme: row.programme,
      enrolmentStatus: row.enrolmentStatus as StudentRecord["credential"]["enrolmentStatus"],
      lifecycleState: row.lifecycleState as StudentRecord["credential"]["lifecycleState"],
      studentNumber: row.studentNumber,
      validFrom: row.validFrom,
      expiresAt: row.expiresAt,
    },
  };
}

export async function getAllStudentsFromSupabase(): Promise<StudentRecord[]> {
  const rows = await prisma.student.findMany();
  return rows.map(prismaRowToStudentRecord);
}

export async function getStudentByIdFromSupabase(id: string): Promise<StudentRecord | undefined> {
  const row = await prisma.student.findUnique({ where: { id } });
  return row ? prismaRowToStudentRecord(row) : undefined;
}

export async function getPendingStudentsFromSupabase(): Promise<StudentRecord[]> {
  const rows = await prisma.student.findMany({
    where: { lifecycleState: "Pending" },
  });
  return rows.map(prismaRowToStudentRecord);
}

export async function updateStudentLifecycleInSupabase(
  id: string,
  lifecycleState: string,
): Promise<void> {
  await prisma.student.update({
    where: { id },
    data: { lifecycleState },
  });
}
