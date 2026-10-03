import { NextResponse } from "next/server";
import { getCurrentAdminSession } from "@/lib/auth/session";
import {
  cancelRenewalEnrolment,
  retryAnnualRenewal,
} from "@/lib/credentials/annualRenewals";
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string; action: string }> },
) {
  const session = await getCurrentAdminSession();
  if (!session)
    return NextResponse.json(
      { error: { message: "Unauthorized." } },
      { status: 401 },
    );
  if (!["SUPER_ADMIN", "ADMIN"].includes(session.user.role ?? ""))
    return NextResponse.json(
      { error: { message: "Only administrators may manage renewals." } },
      { status: 403 },
    );
  const { id, action } = await params;
  try {
    if (action === "cancel") await cancelRenewalEnrolment(id, session.user.id);
    else if (action === "retry" || action === "replace")
      await retryAnnualRenewal(id, session.user.id, action === "replace");
    else
      return NextResponse.json(
        { error: { message: "Unknown renewal action." } },
        { status: 404 },
      );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          message:
            error instanceof Error ? error.message : "Renewal action failed.",
        },
      },
      { status: 409 },
    );
  }
}
