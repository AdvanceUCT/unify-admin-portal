/**
 * @fileoverview Handles the `/api/vendor/verifications/[verificationRequestId]/retry` API boundary, including its authorization and request validation.
 * @module app/api/vendor/verifications/[verificationRequestId]/retry/route
 */

import { NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { vendorFromPortalSession } from "@/lib/vendors/routeAuth";
import { retryVendorWebhook } from "@/lib/vendors/verifications";

/** Handles POST requests to `/api/vendor/verifications/[verificationRequestId]/retry`. */
export async function POST(
  _request: Request,
  context: { params: Promise<{ verificationRequestId: string }> },
) {
  const vendor = await vendorFromPortalSession();
  if (!vendor) return NextResponse.json({ error: { message: "Unauthorized." } }, { status: 401 });
  const { verificationRequestId } = await context.params;
  const verification = await prisma.vendorVerification.findFirst({
    where: { vendorProfileId: vendor.id, verificationRequestId },
    select: { id: true },
  });
  if (!verification) return NextResponse.json({ error: { message: "Verification was not found." } }, { status: 404 });
  return NextResponse.json(await retryVendorWebhook(vendor.id, verification.id));
}
