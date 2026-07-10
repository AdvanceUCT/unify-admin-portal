import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { env } from "@/lib/config/env";
import { renewAllDueCredentials } from "@/lib/credentials/renewal";

/**
 * Compares the request's bearer token to `CRON_SECRET` in constant time,
 * mirroring the webhook route's `signaturesMatch` defense-in-depth style.
 */
function isAuthorized(request: Request, secret: string) {
  const header = request.headers.get("authorization");
  const expected = `Bearer ${secret}`;

  if (!header) return false;

  const headerBuffer = Buffer.from(header);
  const expectedBuffer = Buffer.from(expected);

  return headerBuffer.length === expectedBuffer.length && timingSafeEqual(headerBuffer, expectedBuffer);
}

/**
 * Triggered on a daily schedule by Vercel Cron (see `vercel.json`). Renews
 * every credential issuance whose computed `expiresAt` has passed.
 */
export async function GET(request: Request) {
  if (!env.CRON_SECRET) {
    return NextResponse.json({ error: { message: "CRON_SECRET is not configured." } }, { status: 500 });
  }

  if (!isAuthorized(request, env.CRON_SECRET)) {
    return NextResponse.json({ error: { message: "Unauthorized." } }, { status: 401 });
  }

  const summary = await renewAllDueCredentials(new Date(), null);
  return NextResponse.json(summary, { status: 200 });
}
