import { NextResponse } from "next/server";

import { assertCan, PermissionError, type SessionWithRole } from "@/lib/auth/permissions";
import { getCurrentAdminSession } from "@/lib/auth/session";
import { queueRealBatchIssuance } from "@/lib/issuance/batchIssuance";

export async function POST() {
  const session = await getCurrentAdminSession();

  try {
    assertCan("credential:write", session as SessionWithRole);
  } catch (error) {
    const status = error instanceof PermissionError ? error.status : 401;
    return NextResponse.json({ error: { message: "Unauthorized credential issuance request." } }, { status });
  }

  try {
    return NextResponse.json(await queueRealBatchIssuance(), { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          message: error instanceof Error ? error.message : "Batch credential issuance failed.",
        },
      },
      { status: 502 },
    );
  }
}
