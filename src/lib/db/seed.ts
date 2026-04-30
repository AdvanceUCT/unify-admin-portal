import type { Client } from "@libsql/client";

export async function seedDatabase(db: Client) {
  const result = await db.execute("SELECT COUNT(*) as count FROM students");
  const count = result.rows[0].count as number;
  if (count > 0) return;

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

  const faculties = Object.keys(facultyProgrammes);
  const firstNames = ["Sipho", "Kayla", "Tariq", "Chloe", "Zanele", "Sarah", "Bongani", "Anathi", "Thabo", "Priya", "Lethabo", "Minenhle", "Aarav", "Fatima", "Duan", "Naledi", "Liam", "Musa", "Zoey", "Kabelo"];
  const lastNames = ["Dlamini", "Scott", "Smith", "Gumede", "Patel", "Mokoena", "Botha", "Du Toit", "Van Wyk", "Ngcobo", "Mazibuko", "Naidoo", "Muller", "Ndlovu", "Hendricks", "Jacobs", "Pretorius", "Smit", "Mkhize", "Zwane"];

  let seed = 12345;
  const nextRandom = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };

  let lastFirstName = "";
  let lastSurname = "";

  for (let i = 0; i < 100; i++) {
    const studentCounter = i + 1;

    let fIndex = Math.floor(nextRandom() * firstNames.length);
    let lIndex = Math.floor(nextRandom() * lastNames.length);

    let fName = firstNames[fIndex];
    let lName = lastNames[lIndex];

    if (fName === lastFirstName) {
      fIndex = (fIndex + 1) % firstNames.length;
      fName = firstNames[fIndex];
    }
    if (lName === lastSurname) {
      lIndex = (lIndex + 1) % lastNames.length;
      lName = lastNames[lIndex];
    }

    lastFirstName = fName;
    lastSurname = lName;

    const faculty = faculties[i % faculties.length];
    const programmes = facultyProgrammes[faculty];
    const programme = programmes[i % programmes.length];

    const consonants = (lName.match(/[^aeiou\s]/gi) || []).join("");
    const surPart = consonants.substring(0, 3).toUpperCase().padEnd(3, "X");
    const namePart = fName.substring(0, 3).toUpperCase().padEnd(3, "X");
    const prefix = surPart + namePart;

    const randomSuffix = Math.floor(nextRandom() * 900) + 100;
    const studentNumber = `${prefix}${randomSuffix}`;

    const state = (studentCounter % 10 === 0) ? "Revoked" : "Active";

    await db.execute({
      sql: `INSERT INTO students (id, firstName, lastName, student_number, faculty, programme, lifecycle_state, expires_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        `std-${studentCounter}`,
        fName,
        lName,
        studentNumber,
        faculty,
        programme,
        state,
        "2026-12-31"
      ]
    });
  }

  console.log("Seeded 100 students to Turso.");
}
