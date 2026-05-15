import { NextResponse } from "next/server";

import { assertCan, PermissionError, type SessionWithRole } from "@/lib/auth/permissions";
import { getCurrentAdminSession } from "@/lib/auth/session";
import { getBatchRunDetail } from "@/lib/issuance/batchRuns";

export async function GET(_request: Request, { params }: { params: Promise<{ batchId: string }> }) {
  const session = await getCurrentAdminSession();

  try {
    assertCan("credential:read", session as SessionWithRole);
  } catch (error) {
    const status = error instanceof PermissionError ? error.status : 401;
    return NextResponse.json({ error: { message: "Unauthorized batch run request." } }, { status });
  }

  try {
    const { batchId } = await params;
    return NextResponse.json(await getBatchRunDetail(batchId));
  } catch (error) {
    return NextResponse.json(
      { error: { message: error instanceof Error ? error.message : "Batch run lookup failed." } },
      { status: 404 },
    );
  }
}
