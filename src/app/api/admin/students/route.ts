import { NextResponse } from "next/server";
import { getAllStudents, searchStudents } from "@/lib/db/store";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("query");

  if (query) {
    return NextResponse.json(await searchStudents(query));
  }

  return NextResponse.json(await getAllStudents());
}