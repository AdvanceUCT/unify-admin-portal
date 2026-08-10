/**
 * @fileoverview Handles the `/api/students/import/commit` API boundary, including its authorization and request validation.
 * @module app/api/students/import/commit/route
 */

import { NextResponse } from "next/server";

import { assertCan, PermissionError, type SessionWithRole } from "@/lib/auth/permissions";
import { getCurrentAdminSession, getSessionForAudit } from "@/lib/auth/session";
import { commitImportRun, ImportRunHasErrorsError, NoImportRunError } from "@/lib/imports/commit";
import { getUniversityProfile } from "@/lib/university/profile";

/** Handles POST requests to `/api/students/import/commit`. */
export async function POST(request: Request) {
  const session = await getCurrentAdminSession();

  try {
    assertCan("student:write", session as SessionWithRole);
  } catch (error) {
    const status = error instanceof PermissionError ? error.status : 401;
    return NextResponse.json({ error: { message: "Unauthorized CSV import request." } }, { status });
  }

  try {
    const body = (await request.json().catch(() => undefined)) as { importRunId?: unknown } | undefined;
    const importRunId = typeof body?.importRunId === "string" ? body.importRunId.trim() : "";

    if (!importRunId) {
      return NextResponse.json({ error: { message: "An import run ID is required." } }, { status: 400 });
    }

    const profile = await getUniversityProfile();
    if (!profile) {
      return NextResponse.json(
        { error: { message: "University profile has not been configured." } },
        { status: 409 },
      );
    }

    const auditSession = await getSessionForAudit();
    const result = await commitImportRun({ actorId: auditSession.actorId, importRunId, universityProfileId: profile.id });

    return NextResponse.json(result);
  } catch (error) {
    const status = error instanceof NoImportRunError || error instanceof ImportRunHasErrorsError ? error.status : 500;
    return NextResponse.json(
      { error: { message: error instanceof Error ? error.message : "Failed to commit import." } },
      { status },
    );
  }
}
