import type { Client } from "@libsql/client";
import { getSimulatedUniversityStudentRecords } from "../student-records/simulatedUniversityRecords";

export async function seedDatabase(db: Client) {
  const result = await db.execute("SELECT COUNT(*) as count FROM students");
  const count = result.rows[0].count as number;
  if (count > 0) return;

  const students = getSimulatedUniversityStudentRecords();

  for (const student of students) {
    await db.execute({
      sql: `INSERT INTO students (id, firstName, lastName, email, student_number, faculty, programme, lifecycle_state, expires_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        student.profile.id,
        student.profile.firstName,
        student.profile.lastName,
        student.profile.email,
        student.credential.studentNumber,
        student.credential.faculty ?? "",
        student.credential.programme,
        student.credential.lifecycleState,
        student.credential.expiresAt.slice(0, 10),
      ],
    });
  }

  console.log(`Seeded ${students.length} simulated student records to Turso.`);
}
