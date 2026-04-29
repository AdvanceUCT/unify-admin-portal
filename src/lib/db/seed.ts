import type { Database as BetterSqlite3Database } from "better-sqlite3";

export function seedDatabase(db: BetterSqlite3Database) {
  const existing = db.prepare("SELECT COUNT(*) as count FROM students").get() as { count: number };
  if (existing.count > 0) return;

  const insert = db.prepare(`
    INSERT INTO students (id, firstName, lastName, student_number, faculty, programme, lifecycle_state, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const faculties = ["Commerce", "Science", "Engineering", "Health Sciences", "Law", "Humanities"];
  const firstNames = ["Sipho", "Kayla", "Tariq", "Chloe", "Zanele", "Sarah", "Bongani", "Anathi", "Thabo", "Priya", "Lethabo", "Minenhle", "Aarav", "Fatima", "Duan", "Naledi", "Liam", "Musa", "Zoey", "Kabelo"];
  const lastNames = ["Dlamini", "Scott", "Smith", "Gumede", "Patel", "Mokoena", "Botha", "Du Toit", "Van Wyk", "Ngcobo", "Mazibuko", "Naidoo", "Muller", "Ndlovu", "Hendricks", "Jacobs", "Pretorius", "Smit", "Mkhize", "Zwane"];

  let seed = 12345; 
  const nextRandom = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };

  // Variables to track the names used in the PREVIOUS iteration
  let lastFirstName = "";
  let lastSurname = "";

  for (let i = 0; i < 100; i++) {
    const studentCounter = i + 1;

    // 1. Pick names
    let fIndex = Math.floor(nextRandom() * firstNames.length);
    let lIndex = Math.floor(nextRandom() * lastNames.length);

    let fName = firstNames[fIndex];
    let lName = lastNames[lIndex];

    // 2. ANTI-ADJACENCY CHECK
    // If the picked name is the same as the last one, we shift the index by 1
    // This ensures variety and is still deterministic (consistent for everyone).
    if (fName === lastFirstName) {
      fIndex = (fIndex + 1) % firstNames.length;
      fName = firstNames[fIndex];
    }
    if (lName === lastSurname) {
      lIndex = (lIndex + 1) % lastNames.length;
      lName = lastNames[lIndex];
    }

    // Update trackers for the next loop
    lastFirstName = fName;
    lastSurname = lName;

    const faculty = faculties[i % faculties.length];

    // 3. Generate Prefix
    const consonants = (lName.match(/[^aeiou\s]/gi) || []).join("");
    const surPart = consonants.substring(0, 3).toUpperCase().padEnd(3, "X");
    const namePart = fName.substring(0, 3).toUpperCase().padEnd(3, "X");
    const prefix = surPart + namePart;

    // 4. Shuffled Suffix
    const randomSuffix = Math.floor(nextRandom() * 900) + 100; 
    const studentNumber = `${prefix}${randomSuffix}`;

    const state = (studentCounter % 10 === 0) ? "Revoked" : "Active";

    insert.run(
      `std-${studentCounter}`,
      fName,
      lName,
      studentNumber,
      faculty,
      `${faculty} Programme`,
      state,
      "2026-12-31"
    );
  }

  console.log("Seeded 100 students: Guaranteed variety and consistent IDs.");
}
