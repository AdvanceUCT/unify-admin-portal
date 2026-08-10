/**
 * @fileoverview Handles the `/api/admin/students/[studentId]` API boundary, including its authorization and request validation.
 * @module app/api/admin/students/[studentId]/route
 */

import { NextResponse } from "next/server";
import { overlayCredentialStatusForStudent } from "@/lib/credentials/status";
import { getStudentById } from "@/lib/students/repository";

/** Handles GET requests to `/api/admin/students/[studentId]`. */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ studentId: string }> }
) {
  const { studentId } = await params;
  const student = await getStudentById(studentId);

  if (!student) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(await overlayCredentialStatusForStudent(student));
}
