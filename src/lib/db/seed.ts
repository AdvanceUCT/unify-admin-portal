import type { Client } from "@libsql/client";

export async function seedDatabase(db: Client) {
  const result = await db.execute("SELECT COUNT(*) as count FROM students");
  const count = result.rows[0].count as number;
  if (count > 0) return;

  const faculties = ["Commerce", "Science", "Engineering", "Health Sciences", "Law", "Humanities"];
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
        `${faculty} Programme`,
        state,
        "2026-12-31"
      ]
    });
  }

  console.log("Seeded 100 students to Turso.");
}
