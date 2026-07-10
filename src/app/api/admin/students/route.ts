import { NextResponse } from "next/server";
import { overlayCredentialStatuses } from "@/lib/credentials/status";
import { getAllStudents, searchStudents } from "@/lib/students/repository";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("query");

  if (query) {
    return NextResponse.json(await overlayCredentialStatuses(await searchStudents(query)));
  }

  return NextResponse.json(await overlayCredentialStatuses(await getAllStudents()));
}
