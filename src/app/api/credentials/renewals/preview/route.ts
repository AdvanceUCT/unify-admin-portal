import { NextResponse } from "next/server";
import { getCurrentAdminSession } from "@/lib/auth/session";
import { currentValidityPolicy } from "@/lib/credentials/validityPolicy";
import {
  parseRenewalOptions,
  renewalPreview,
} from "@/lib/credentials/academicPeriod";
export async function GET(request: Request) {
  try {
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
    const params = new URL(request.url).searchParams;
    const options = parseRenewalOptions({
      autoRenew: params.get("autoRenew") === "true",
      renewalYears: params.get("renewalYears"),
    });
    const policy = await currentValidityPolicy(),
      now = new Date();
    let preview = renewalPreview(policy, now, options);
    if (params.has("retainUntil")) {
      const finalYear = Number(params.get("retainUntil"));
      if (
        !Number.isInteger(finalYear) ||
        Math.abs(finalYear - preview.academicYear) > 99
      )
        throw new Error("Invalid retained academic year.");
      preview = {
        ...renewalPreview(policy, now, {
          autoRenew: true,
          renewalYears: Math.max(1, finalYear - preview.academicYear + 1),
        }),
        finalYear,
      };
    }
    return NextResponse.json(preview);
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          message:
            error instanceof Error
              ? error.message
              : "Unable to preview credential.",
        },
      },
      { status: 400 },
    );
  }
}
