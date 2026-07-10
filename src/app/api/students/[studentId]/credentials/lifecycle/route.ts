import { NextResponse } from "next/server";

import { assertCan, PermissionError, type SessionWithRole } from "@/lib/auth/permissions";
import { getCurrentAdminSession, getSessionForAudit } from "@/lib/auth/session";
import {
  CredentialLifecycleActionError,
  requestCredentialLifecycleChange,
  type CredentialLifecycleAction,
} from "@/lib/credentials/lifecycleActions";
import { getStudentById } from "@/lib/students/repository";

function isLifecycleAction(value: unknown): value is CredentialLifecycleAction {
  return value === "reactivate" || value === "revoke" || value === "suspend";
}

export async function POST(request: Request, { params }: { params: Promise<{ studentId: string }> }) {
  const session = await getCurrentAdminSession();
  try {
    assertCan("credential:write", session as SessionWithRole);
  } catch (error) {
    const status = error instanceof PermissionError ? error.status : 401;
    return NextResponse.json({ error: { message: "Unauthorized credential lifecycle request." } }, { status });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: { message: "Request body must be valid JSON." } }, { status: 400 });
  }

  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  if (!isLifecycleAction(record.action) || typeof record.reason !== "string") {
    return NextResponse.json(
      { error: { message: "action and reason are required." } },
      { status: 400 },
    );
  }

  try {
    const [{ studentId }, auditSession] = await Promise.all([params, getSessionForAudit()]);
    const student = await getStudentById(studentId);
    return NextResponse.json(
      await requestCredentialLifecycleChange({
        action: record.action,
        actorId: auditSession.actorId,
        reason: record.reason,
        studentId,
        studentLookupIds: student ? [student.profile.id, student.credential.studentNumber] : undefined,
      }),
    );
  } catch (error) {
    const status = error instanceof CredentialLifecycleActionError ? error.status : 502;
    return NextResponse.json(
      { error: { message: error instanceof Error ? error.message : "Credential lifecycle request failed." } },
      { status },
    );
  }
}
