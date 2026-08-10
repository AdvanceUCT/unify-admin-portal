/**
 * @fileoverview Handles the `/api/students/import/upload` API boundary, including its authorization and request validation.
 * @module app/api/students/import/upload/route
 */

import { NextResponse } from "next/server";

import { assertCan, PermissionError, type SessionWithRole } from "@/lib/auth/permissions";
import { getCurrentAdminSession } from "@/lib/auth/session";
import { parseCsvHeader } from "@/lib/imports/csv";
import { csvFileTooLargeMessage, MAX_CSV_FILE_SIZE_BYTES } from "@/lib/imports/limits";

/**
 * Parses an uploaded CSV's header row for the column-mapping step.
 * The file itself is not persisted — only the detected column names are
 * returned. Full-row parsing and staging is introduced in a later phase.
 */
export async function POST(request: Request) {
  const session = await getCurrentAdminSession();

  try {
    assertCan("student:write", session as SessionWithRole);
  } catch (error) {
    const status = error instanceof PermissionError ? error.status : 401;
    return NextResponse.json({ error: { message: "Unauthorized CSV import request." } }, { status });
  }

  const formData = await request.formData().catch(() => undefined);
  const file = formData?.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: { message: "A CSV file is required." } }, { status: 400 });
  }

  if (file.size > MAX_CSV_FILE_SIZE_BYTES) {
    return NextResponse.json({ error: { message: csvFileTooLargeMessage() } }, { status: 400 });
  }

  const text = await file.text();
  const { columns, errors } = parseCsvHeader(text);

  if (columns.length === 0) {
    return NextResponse.json(
      { error: { message: "Could not detect any columns in the uploaded file." } },
      { status: 400 },
    );
  }

  if (errors.length > 0) {
    return NextResponse.json({ error: { message: errors.join(" ") } }, { status: 400 });
  }

  return NextResponse.json({ columns });
}
