import { NextResponse } from "next/server";
import { getCurrentAdminSession } from "@/lib/auth/session";
import { renewalOverview } from "@/lib/credentials/renewalOverview";
export async function GET(request: Request) {
  const session = await getCurrentAdminSession();
  if (!session)
    return NextResponse.json(
      { error: { message: "Unauthorized." } },
      { status: 401 },
    );
  if (!["SUPER_ADMIN", "ADMIN", "ISSUER"].includes(session.user.role ?? ""))
    return NextResponse.json(
      { error: { message: "Forbidden." } },
      { status: 403 },
    );
  try {
    return NextResponse.json(
      await renewalOverview(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          message:
            error instanceof Error ? error.message : "Unable to read renewals.",
        },
      },
      { status: 400 },
    );
  }
}
