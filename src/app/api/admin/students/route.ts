/**
 * @fileoverview Handles the `/api/admin/students` API boundary, including its authorization and request validation.
 * @module app/api/admin/students/route
 */

import { NextResponse } from "next/server";
import { overlayCredentialStatuses } from "@/lib/credentials/status";
import { getAllStudents, searchStudents } from "@/lib/students/repository";

/** Handles GET requests to `/api/admin/students`. */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("query");

  if (query) {
    return NextResponse.json(await overlayCredentialStatuses(await searchStudents(query)));
  }

  return NextResponse.json(await overlayCredentialStatuses(await getAllStudents()));
}
