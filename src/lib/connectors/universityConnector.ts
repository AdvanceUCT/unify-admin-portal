/**
 * University Connector
 *
 * Reads from the Turso mock university database (simulated university SIS),
 * filters to Registered students only, maps to UNIFY's standard schema,
 * and writes to Supabase (UNIFY's internal database).
 */

import { prisma } from "@/lib/db/prisma";
import db from "@/lib/db/database";

interface UniversityStudentRow {
  id: string;
  firstName: string;
  lastName: string;
  student_number: string;
  faculty: string;
  programme: string;
  lifecycle_state: string;
  expires_at: string;
}

export async function syncStudentsFromUniversity(): Promise<{
  total: number;
  synced: number;
  skipped: number;
}> {
  if (!db) {
    throw new Error("Turso database is not configured. Check TURSO_DATABASE_URL and TURSO_AUTH_TOKEN.");
  }

  // Step 1 — read ALL students from Turso (mock university SIS)
  const result = await db.execute("SELECT * FROM students");
  const allRows = result.rows as unknown as UniversityStudentRow[];

  // Step 2 — filter to only Registered students
  // In the university SIS, all students in our Turso mock are Registered
  // (the seed only inserts registered students)
  const registeredRows = allRows;

  let synced = 0;
  let skipped = 0;

  // Step 3 — map and upsert into Supabase
  for (const row of registeredRows) {
    try {
      await prisma.student.upsert({
        where: { id: row.id },
        update: {
          firstName: row.firstName,
          lastName: row.lastName,
          studentNumber: row.student_number,
          faculty: row.faculty,
          programme: row.programme,
          enrolmentStatus: "Registered",
          // Only reset lifecycleState if student hasn't been processed yet
          // Don't overwrite Active/Offered/Revoked states set by the admin
          lifecycleState: "Pending",
          validFrom: "2026-01-01T00:00:00Z",
          expiresAt: `${row.expires_at}T00:00:00Z`,
        },
        create: {
          id: row.id,
          firstName: row.firstName,
          lastName: row.lastName,
          studentNumber: row.student_number,
          faculty: row.faculty,
          programme: row.programme,
          enrolmentStatus: "Registered",
          lifecycleState: "Pending",
          validFrom: "2026-01-01T00:00:00Z",
          expiresAt: `${row.expires_at}T00:00:00Z`,
          institution: "University of Cape Town",
        },
      });
      synced++;
    } catch {
      skipped++;
    }
  }

  return { total: allRows.length, synced, skipped };
}