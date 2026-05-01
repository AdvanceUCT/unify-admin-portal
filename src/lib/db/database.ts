import { createClient } from "@libsql/client";

const tursoDatabaseUrl = process.env.TURSO_DATABASE_URL;
const tursoAuthToken = process.env.TURSO_AUTH_TOKEN;

const db =
  tursoDatabaseUrl && tursoAuthToken
    ? createClient({
        authToken: tursoAuthToken,
        url: tursoDatabaseUrl,
      })
    : null;

export default db;
