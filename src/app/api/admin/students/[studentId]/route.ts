import { NextResponse } from "next/server";
import { getStudentById } from "@/lib/db/store";

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const student = getStudentById(params.id);

  if (!student) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(student);
}