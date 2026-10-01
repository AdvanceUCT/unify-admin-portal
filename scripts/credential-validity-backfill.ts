import { config } from "dotenv";
config({ path: ".env.local" }); config({ path: ".env" });
async function main() {
  if (process.argv.slice(2).some(flag => flag !== "--apply")) throw new Error("Only --apply is supported; default is dry-run.");
  const { prisma } = await import("../src/lib/db/prisma");
  const { backfillCredentialValidity } = await import("../src/lib/credentials/validityBackfill");
  const totals = { scanned: 0, recoverable: 0, updated: 0, unavailable: 0, conflicting: 0 };
  let after: string | undefined;
  try {
    do {
      const result = await backfillCredentialValidity({ apply: process.argv.includes("--apply"), after });
      for (const key of Object.keys(totals) as (keyof typeof totals)[]) totals[key] += result[key];
      after = result.next ?? undefined;
    } while (after);
    console.log({ mode: process.argv.includes("--apply") ? "apply" : "dry-run", ...totals });
  } finally { await prisma.$disconnect(); }
}
main().catch(() => { console.error("Credential validity backfill failed; inspect server diagnostics privately."); process.exitCode = 1; });
