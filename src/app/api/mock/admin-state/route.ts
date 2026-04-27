import { NextResponse } from "next/server";
import { getMockAdminState } from "@/lib/api/mockActivationStore";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(getMockAdminState());
}
