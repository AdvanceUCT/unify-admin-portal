import { NextResponse } from "next/server";

import { assertCan, PermissionError, type SessionWithRole } from "@/lib/auth/permissions";
import { getCurrentAdminSession, getSessionForAudit } from "@/lib/auth/session";
import { retryCredentialAutomationJob } from "@/lib/credentials/automation";

export async function POST(_request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const session = await getCurrentAdminSession();
  try {
    assertCan("credential:write", session as SessionWithRole);
  } catch (error) {
    return NextResponse.json(
      { error: { message: "Unauthorized credential automation retry." } },
      { status: error instanceof PermissionError ? error.status : 401 },
    );
  }

  try {
    const [{ jobId }, audit] = await Promise.all([params, getSessionForAudit()]);
    return NextResponse.json(await retryCredentialAutomationJob(jobId, audit.actorId));
  } catch (error) {
    return NextResponse.json(
      { error: { message: error instanceof Error ? error.message : "Credential automation retry failed." } },
      { status: 409 },
    );
  }
}
