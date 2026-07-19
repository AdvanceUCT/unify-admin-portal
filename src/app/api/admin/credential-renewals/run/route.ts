import { NextResponse } from "next/server";

import { assertCan, PermissionError, type SessionWithRole } from "@/lib/auth/permissions";
import { getCurrentAdminSession, getSessionForAudit } from "@/lib/auth/session";
import { renewAllDueCredentials } from "@/lib/credentials/renewal";

/**
 * Lets an admin manually trigger the same batch renewal job the nightly cron
 * runs, after reviewing the dry-run preview at
 * `/credentials/issuance/renewals/preview`. Recorded with `trigger: "MANUAL"`
 * so the audit trail distinguishes an admin-initiated run from the cron.
 */
export async function POST() {
  const session = await getCurrentAdminSession();

  try {
    assertCan("credential:write", session as SessionWithRole);
  } catch (error) {
    const status = error instanceof PermissionError ? error.status : 401;
    return NextResponse.json({ error: { message: "Unauthorized credential renewal request." } }, { status });
  }

  const auditSession = await getSessionForAudit();
  const summary = await renewAllDueCredentials(new Date(), auditSession.actorId, "MANUAL");

  return NextResponse.json(summary, { status: 200 });
}
