import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { env } from "@/lib/config/env";
import { runCredentialAutomation } from "@/lib/credentials/automation";

function authorized(request: Request, secret: string) {
  const supplied = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export async function GET(request: Request) {
  if (!env.CRON_SECRET) {
    return NextResponse.json({ error: { message: "CRON_SECRET is not configured." } }, { status: 500 });
  }
  if (!authorized(request, env.CRON_SECRET)) {
    return NextResponse.json({ error: { message: "Unauthorized." } }, { status: 401 });
  }
  return NextResponse.json(await runCredentialAutomation());
}
