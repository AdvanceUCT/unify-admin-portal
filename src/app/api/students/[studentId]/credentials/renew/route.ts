import { NextResponse } from "next/server";

import { assertCan, PermissionError, type SessionWithRole } from "@/lib/auth/permissions";
import { getCurrentAdminSession, getSessionForAudit } from "@/lib/auth/session";
import { findLatestCredentialIssuanceForStudent } from "@/lib/credentials/status";
import { renewCredentialIssuance } from "@/lib/credentials/renewal";
import { getStudentById } from "@/lib/db/store";
import { StudentIssuanceError } from "@/lib/issuance/batchIssuance";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ studentId: string }> },
) {
  const session = await getCurrentAdminSession();

  try {
    assertCan("credential:write", session as SessionWithRole);
  } catch (error) {
    const status = error instanceof PermissionError ? error.status : 401;
    return NextResponse.json({ error: { message: "Unauthorized credential renewal request." } }, { status });
  }

  const { studentId } = await params;

  try {
    const student = await getStudentById(studentId);
    if (!student) {
      return NextResponse.json({ error: { message: "Student record was not found." } }, { status: 404 });
    }

    const issuance = await findLatestCredentialIssuanceForStudent(student);
    if (!issuance) {
      return NextResponse.json({ error: { message: "This student has no credential to renew." } }, { status: 404 });
    }

    const auditSession = await getSessionForAudit();
    return NextResponse.json(
      await renewCredentialIssuance({ actorId: auditSession.actorId, issuanceId: issuance.id, trigger: "MANUAL" }),
      { status: 201 },
    );
  } catch (error) {
    const status = error instanceof StudentIssuanceError ? error.status : 502;
    return NextResponse.json(
      {
        error: {
          message: error instanceof Error ? error.message : "Student credential renewal failed.",
        },
      },
      { status },
    );
  }
}
