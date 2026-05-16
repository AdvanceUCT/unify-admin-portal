import { NextResponse } from "next/server";

import { assertCan, PermissionError, type SessionWithRole } from "@/lib/auth/permissions";
import { getCurrentAdminSession, getSessionForAudit } from "@/lib/auth/session";
import { queueRealStudentIssuance, StudentIssuanceError } from "@/lib/issuance/batchIssuance";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ studentId: string }> },
) {
  const session = await getCurrentAdminSession();

  try {
    assertCan("credential:write", session as SessionWithRole);
  } catch (error) {
    const status = error instanceof PermissionError ? error.status : 401;
    return NextResponse.json({ error: { message: "Unauthorized credential issuance request." } }, { status });
  }

  const { studentId } = await params;

  try {
    const auditSession = await getSessionForAudit();
    return NextResponse.json(await queueRealStudentIssuance(studentId, new Date(), auditSession.actorId), {
      status: 201,
    });
  } catch (error) {
    const status = error instanceof StudentIssuanceError ? error.status : 502;
    return NextResponse.json(
      {
        error: {
          message: error instanceof Error ? error.message : "Student credential issuance failed.",
        },
      },
      { status },
    );
  }
}
