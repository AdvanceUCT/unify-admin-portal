/**
 * @fileoverview Handles the `/api/credentials/issuance/batch/runs/[batchId]/retry-failed` API boundary, including its authorization and request validation.
 * @module app/api/credentials/issuance/batch/runs/[batchId]/retry-failed/route
 */

import { after, NextResponse } from "next/server";

import { assertCan, PermissionError, type SessionWithRole } from "@/lib/auth/permissions";
import { getCurrentAdminSession, getSessionForAudit } from "@/lib/auth/session";
import { retryFailedBatchRun, processBatchRunInBackground } from "@/lib/issuance/batchRuns";
import { StudentIssuanceError } from "@/lib/issuance/batchIssuance";

export const maxDuration = 300;

/** Handles POST requests to `/api/credentials/issuance/batch/runs/[batchId]/retry-failed`. */
export async function POST(_request: Request, { params }: { params: Promise<{ batchId: string }> }) {
  const session = await getCurrentAdminSession();

  try {
    assertCan("credential:write", session as SessionWithRole);
  } catch (error) {
    const status = error instanceof PermissionError ? error.status : 401;
    return NextResponse.json({ error: { message: "Unauthorized batch retry request." } }, { status });
  }

  try {
    const [{ batchId }, auditSession] = await Promise.all([params, getSessionForAudit()]);
    const run = await retryFailedBatchRun(batchId, auditSession.actorId);
    after(() => processBatchRunInBackground(run.batchId, auditSession.actorId));
    return NextResponse.json(run, { status: 202, headers: { Location: `/api/credentials/issuance/batch/runs/${encodeURIComponent(batchId)}` } });
  } catch (error) {
    return NextResponse.json(
      { error: { message: error instanceof Error ? error.message : "Batch retry failed." } },
      { status: error instanceof StudentIssuanceError ? error.status : 502 },
    );
  }
}
