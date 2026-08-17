/**
 * @fileoverview Handles the `/api/ethereum/students/remove` API boundary, including its authorization and request validation.
 * @module app/api/ethereum/students/remove/route
 */

import { NextResponse } from "next/server";

import { assertCan, PermissionError, type SessionWithRole } from "@/lib/auth/permissions";
import { getCurrentAdminSession } from "@/lib/auth/session";
import { EthereumServiceError, removeStudentFromChain } from "@/lib/ethereum/ethereumService";

/** Handles POST requests to `/api/ethereum/students/remove`. */
export async function POST(request: Request) {
  const session = await getCurrentAdminSession();

  try {
    assertCan("student:write", session as SessionWithRole);
  } catch (error) {
    const status = error instanceof PermissionError ? error.status : 401;
    return NextResponse.json({ error: { message: "Unauthorized student removal request." } }, { status });
  }

  const body = (await request.json().catch(() => undefined)) as
    | { studentEthAddress?: unknown; credentialExchangeId?: unknown }
    | undefined;
  const studentEthAddress = typeof body?.studentEthAddress === "string" ? body.studentEthAddress.trim() : "";

  if (!studentEthAddress) {
    return NextResponse.json({ error: { message: "studentEthAddress is required." } }, { status: 400 });
  }

  try {
    const result = await removeStudentFromChain(studentEthAddress);
    return NextResponse.json({ ...result, studentEthAddress });
  } catch (error) {
    const status = error instanceof EthereumServiceError ? error.statusCode : 502;
    return NextResponse.json(
      { error: { message: error instanceof Error ? error.message : "On-chain student removal failed." } },
      { status },
    );
  }
}
