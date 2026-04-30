import { createClient } from "@libsql/client";

console.log("TURSO_DATABASE_URL:", process.env.TURSO_DATABASE_URL);
console.log("TURSO_AUTH_TOKEN:", process.env.TURSO_AUTH_TOKEN ? "exists" : "missing");

const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});

export default db;