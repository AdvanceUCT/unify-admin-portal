/**
 * @fileoverview Handles the `/api/ethereum/students/link` API boundary, including its authorization and request validation.
 * @module app/api/ethereum/students/link/route
 */

import { isAddress } from "ethers";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";

/**
 * Handles POST requests to `/api/ethereum/students/link`.
 * Called by the student's own wallet — not the admin portal — so it takes no admin session.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => undefined)) as
    | { studentNumber?: unknown; studentEthAddress?: unknown }
    | undefined;
  const studentNumber = typeof body?.studentNumber === "string" ? body.studentNumber.trim() : "";
  const studentEthAddress = typeof body?.studentEthAddress === "string" ? body.studentEthAddress.trim() : "";

  if (!studentNumber || !isAddress(studentEthAddress)) {
    return NextResponse.json(
      { error: { message: "A valid studentNumber and studentEthAddress are required." } },
      { status: 400 },
    );
  }

  try {
    const student = await prisma.student.findUnique({ where: { studentNumber } });
    if (!student) {
      return NextResponse.json({ error: { message: "Student was not found." } }, { status: 400 });
    }

    await prisma.student.update({
      data: { ethAddress: studentEthAddress },
      where: { id: student.id },
    });

    return NextResponse.json({ linked: true, studentEthAddress });
  } catch {
    return NextResponse.json({ error: { message: "Failed to link the Ethereum address." } }, { status: 500 });
  }
}
