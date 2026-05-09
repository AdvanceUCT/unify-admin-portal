import { type NextRequest, NextResponse } from "next/server";
import { getAllStudentsFromSupabase } from "@/lib/db/store";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const query = searchParams.get("query") ?? "";

  const students = await getAllStudentsFromSupabase();

  if (query) {
    const q = query.toLowerCase();
    const filtered = students.filter((s) =>
      s.profile.firstName.toLowerCase().includes(q) ||
      s.profile.lastName.toLowerCase().includes(q) ||
      `${s.profile.firstName} ${s.profile.lastName}`.toLowerCase().includes(q) ||
      s.credential.studentNumber.toLowerCase().includes(q)
    );
    return NextResponse.json(filtered);
  }

  return NextResponse.json(students);
}