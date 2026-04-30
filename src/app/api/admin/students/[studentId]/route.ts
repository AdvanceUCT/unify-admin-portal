import { NextResponse } from "next/server";
import { getStudentById } from "@/lib/db/store";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ studentId: string }> }
) {
  const { studentId } = await params;
  const student = getStudentById(studentId);

  if (!student) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(student);
}