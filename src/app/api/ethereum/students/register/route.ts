/**
 * @fileoverview Handles the `/api/ethereum/students/register` API boundary, including its authorization and request validation.
 * @module app/api/ethereum/students/register/route
 */

import { NextResponse } from "next/server";

import { assertCan, PermissionError, type SessionWithRole } from "@/lib/auth/permissions";
import { getCurrentAdminSession } from "@/lib/auth/session";
import { EthereumServiceError, registerStudentOnChain } from "@/lib/ethereum/ethereumService";

/** Handles POST requests to `/api/ethereum/students/register`. */
export async function POST(request: Request) {
  const session = await getCurrentAdminSession();

  try {
    assertCan("student:write", session as SessionWithRole);
  } catch (error) {
    const status = error instanceof PermissionError ? error.status : 401;
    return NextResponse.json({ error: { message: "Unauthorized student registration request." } }, { status });
  }

  const body = (await request.json().catch(() => undefined)) as
    | { studentEthAddress?: unknown; studentNumber?: unknown; credentialExchangeId?: unknown }
    | undefined;
  const studentEthAddress = typeof body?.studentEthAddress === "string" ? body.studentEthAddress.trim() : "";
  const studentNumber = typeof body?.studentNumber === "string" ? body.studentNumber.trim() : "";
  const credentialExchangeId = typeof body?.credentialExchangeId === "string" ? body.credentialExchangeId.trim() : "";

  if (!studentEthAddress || !studentNumber || !credentialExchangeId) {
    return NextResponse.json(
      { error: { message: "studentEthAddress, studentNumber, and credentialExchangeId are required." } },
      { status: 400 },
    );
  }

  try {
    const result = await registerStudentOnChain(studentEthAddress, studentNumber);
    return NextResponse.json({ ...result, studentEthAddress, credentialExchangeId });
  } catch (error) {
    const status = error instanceof EthereumServiceError ? error.statusCode : 502;
    return NextResponse.json(
      { error: { message: error instanceof Error ? error.message : "On-chain student registration failed." } },
      { status },
    );
  }
}
