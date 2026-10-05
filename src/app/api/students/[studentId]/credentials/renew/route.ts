/**
 * @fileoverview Handles the `/api/students/[studentId]/credentials/renew` API boundary, including its authorization and request validation.
 * @module app/api/students/[studentId]/credentials/renew/route
 */

import { parseRenewalOptions } from "@/lib/credentials/academicPeriod";
import { NextResponse } from "next/server";

import {
  assertCan,
  PermissionError,
  type SessionWithRole,
} from "@/lib/auth/permissions";
import { getCurrentAdminSession, getSessionForAudit } from "@/lib/auth/session";
import {
  queueRealStudentRenewal,
  StudentIssuanceError,
} from "@/lib/issuance/batchIssuance";

/** Handles POST requests to `/api/students/[studentId]/credentials/renew`. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ studentId: string }> },
) {
  const session = await getCurrentAdminSession();

  try {
    assertCan("credential:write", session as SessionWithRole);
  } catch (error) {
    const status = error instanceof PermissionError ? error.status : 401;
    return NextResponse.json(
      { error: { message: "Unauthorized credential renewal request." } },
      { status },
    );
  }

  const { studentId } = await params;

  try {
    let options;
    try {
      const body = await request.text();
      options = parseRenewalOptions(body ? JSON.parse(body) : {});
    } catch (error) {
      return NextResponse.json(
        {
          error: {
            message:
              error instanceof Error
                ? error.message
                : "Invalid issuance options.",
          },
        },
        { status: 400 },
      );
    }
    const auditSession = await getSessionForAudit();
    return NextResponse.json(
      await queueRealStudentRenewal(
        studentId,
        new Date(),
        auditSession.actorId,
        options,
      ),
      {
        status: 201,
      },
    );
  } catch (error) {
    const status = error instanceof StudentIssuanceError ? error.status : 502;
    return NextResponse.json(
      {
        error: {
          message:
            error instanceof Error
              ? error.message
              : "Student credential renewal failed.",
        },
      },
      { status },
    );
  }
}
