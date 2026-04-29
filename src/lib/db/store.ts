import db from "./database";
import { seedDatabase } from "./seed";
import type { StudentRecord } from "@/lib/api/types";
// Ensure DB is seeded once
seedDatabase(db);

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
      expiresAt: `${row.expires_at}T00:00:00Z`,
    },
  };
}

// Get all students
export function getAllStudents(): StudentRecord[] {
  const rows = db.prepare("SELECT * FROM students").all() as Record<string, unknown>[];
  return rows.map(rowToStudentRecord);
}


// Get one student
export function getStudentById(id: string): StudentRecord | undefined {
  const row = db.prepare("SELECT * FROM students WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? rowToStudentRecord(row) : undefined;
}

// Search students (Updated for Renaming)
export function searchStudents(query: string): StudentRecord[] {
  const rows = db.prepare(`
    SELECT * FROM students
    WHERE firstName LIKE ? 
    OR lastName LIKE ? 
    OR student_number LIKE ?
  `).all(`%${query}%`, `%${query}%`, `%${query}%`) as Record<string, unknown>[];
  
  return rows.map(rowToStudentRecord);
}


// Update status (optional but useful)
export function updateStudentStatus(id: string, status: string) {
  return db.prepare(`
    UPDATE students SET lifecycle_state = ?
    WHERE id = ?
  `).run(status, id);
}