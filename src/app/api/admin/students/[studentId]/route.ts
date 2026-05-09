import { type NextRequest, NextResponse } from "next/server";
import { getStudentByIdFromSupabase } from "@/lib/db/store";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ studentId: string }> }
) {
  const { studentId } = await params;
  const student = await getStudentByIdFromSupabase(studentId);

  if (!student) {
    return NextResponse.json(
      { error: { code: "STUDENT_NOT_FOUND", message: `No student found with id "${studentId}".` } },
      { status: 404 }
    );
  }

  return NextResponse.json(student);
}