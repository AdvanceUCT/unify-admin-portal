import { NextResponse } from "next/server";
import { overlayCredentialStatusForStudent } from "@/lib/credentials/status";
import { getStudentById } from "@/lib/students/repository";

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
