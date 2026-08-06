import { NextResponse } from "next/server";

import { getApprovedVendorContextForUser } from "@/lib/vendors/context";
import { getLiveVerificationEvents } from "@/lib/vendors/liveVerifications";
import { getCurrentVendorSession } from "@/lib/auth/session";

export async function GET(request: Request) {
  const session = await getCurrentVendorSession();
  if (!session || session.user.userType !== "VENDOR") {
    return NextResponse.json({ error: { message: "Unauthorized." } }, { status: 401 });
  }
  const context = await getApprovedVendorContextForUser(session.user.id);
  if (!context) return NextResponse.json({ error: { message: "Forbidden." } }, { status: 403 });

  try {
    const result = await getLiveVerificationEvents(context, new URL(request.url).searchParams.get("cursor") ?? undefined);
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch (error) {
    return NextResponse.json(
      { error: { message: error instanceof Error ? error.message : "Unable to load live verifications." } },
      { status: 400, headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  }
}
