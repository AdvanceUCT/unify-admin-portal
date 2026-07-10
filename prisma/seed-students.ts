/*
 * Seeds a small demo cohort of students (including Caleb and Joshua) into the
 * Student table, for local testing now that CSV import replaces the mock
 * student data source. Safe to re-run — upserts by studentNumber.
 */
import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

const DEMO_COHORT_SIZE = 8;

async function main() {
  const { prisma } = await import("../src/lib/db/prisma");
  const { getSimulatedUniversityStudentRecords } = await import(
    "../src/lib/student-records/simulatedUniversityRecords"
  );

  try {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Refusing to run demo student seed in production.");
    }

    const records = getSimulatedUniversityStudentRecords();
    const demoRecords = [...records.slice(0, DEMO_COHORT_SIZE), ...records.slice(-2)];

    for (const record of demoRecords) {
      await prisma.student.upsert({
        create: {
          attributes: { year: "2026" },
          email: record.profile.email,
          faculty: record.credential.faculty,
          firstName: record.profile.firstName,
          lastName: record.profile.lastName,
          programme: record.credential.programme,
          source: "seed",
          studentNumber: record.credential.studentNumber,
        },
        update: {},
        where: { studentNumber: record.credential.studentNumber },
      });
    }

    console.log(`Seeded ${demoRecords.length} demo students (including Caleb and Joshua).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
