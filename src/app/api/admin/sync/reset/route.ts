import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "Reset is not available in production." },
      { status: 403 }
    );
  }

  await prisma.activationDelivery.deleteMany();
  await prisma.issuedCredential.deleteMany();
  await prisma.batch.deleteMany();
  await prisma.student.updateMany({
    data: { lifecycleState: "Pending" },
  });

  const count = await prisma.student.count();

  return NextResponse.json({
    message: `Reset complete. ${count} students set back to Pending.`,
    count,
  });
}