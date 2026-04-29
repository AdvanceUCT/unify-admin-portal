import Database from "better-sqlite3";
import path from "path";

const dbPath = path.join(process.cwd(), "students.db");
const db = new Database(dbPath);

// Create table if it doesn't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS students (
    id TEXT PRIMARY KEY,
    firstName TEXT NOT NULL,
    lastName TEXT NOT NULL,
    student_number TEXT UNIQUE NOT NULL,
    faculty TEXT NOT NULL,
    programme TEXT NOT NULL,
    lifecycle_state TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );
`);

export default db;