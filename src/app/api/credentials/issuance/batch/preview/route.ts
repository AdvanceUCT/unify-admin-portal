/**
 * @fileoverview Handles the `/api/credentials/issuance/batch/preview` API boundary, including its authorization and request validation.
 * @module app/api/credentials/issuance/batch/preview/route
 */

import { NextResponse } from "next/server";

import { assertCan, PermissionError, type SessionWithRole } from "@/lib/auth/permissions";
import { getCurrentAdminSession } from "@/lib/auth/session";
import { previewBatchIssuance } from "@/lib/issuance/batchRuns";
import { parseBatchIssuanceSelection, StudentIssuanceError } from "@/lib/issuance/batchIssuance";

/** Handles POST requests to `/api/credentials/issuance/batch/preview`. */
export async function POST(request: Request) {
  const session = await getCurrentAdminSession();

  try {
    assertCan("credential:read", session as SessionWithRole);
  } catch (error) {
    const status = error instanceof PermissionError ? error.status : 401;
    return NextResponse.json({ error: { message: "Unauthorized batch preview request." } }, { status });
  }

  try {
    const body = (await request.json().catch(() => undefined)) as unknown;
    const selection = parseBatchIssuanceSelection(body);
    return NextResponse.json(await previewBatchIssuance(selection));
  } catch (error) {
    const status = error instanceof StudentIssuanceError ? error.status : 502;
    return NextResponse.json(
      { error: { message: error instanceof Error ? error.message : "Batch preview failed." } },
      { status },
    );
  }
}
