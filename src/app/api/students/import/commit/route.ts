import { NextResponse } from "next/server";

import { assertCan, PermissionError, type SessionWithRole } from "@/lib/auth/permissions";
import { getCurrentAdminSession, getSessionForAudit } from "@/lib/auth/session";
import { commitImportRun, NoImportRunError } from "@/lib/imports/commit";
import { getUniversityProfile } from "@/lib/university/profile";

export async function POST() {
  const session = await getCurrentAdminSession();

  try {
    assertCan("student:write", session as SessionWithRole);
  } catch (error) {
    const status = error instanceof PermissionError ? error.status : 401;
    return NextResponse.json({ error: { message: "Unauthorized CSV import request." } }, { status });
  }

  try {
    const profile = await getUniversityProfile();
    if (!profile) {
      return NextResponse.json(
        { error: { message: "University profile has not been configured." } },
        { status: 409 },
      );
    }

    const auditSession = await getSessionForAudit();
    const result = await commitImportRun({ actorId: auditSession.actorId, universityProfileId: profile.id });

    return NextResponse.json(result);
  } catch (error) {
    const status = error instanceof NoImportRunError ? error.status : 500;
    return NextResponse.json(
      { error: { message: error instanceof Error ? error.message : "Failed to commit import." } },
      { status },
    );
  }
}
