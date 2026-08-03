import { NextResponse } from "next/server";

import { configureVendorWebhook, disableVendorWebhook, getVendorWebhookConfig } from "@/lib/vendors/integrations";
import { vendorFromPortalSession } from "@/lib/vendors/routeAuth";

export async function GET() {
  const vendor = await vendorFromPortalSession();
  if (!vendor) return NextResponse.json({ error: { message: "Unauthorized." } }, { status: 401 });
  return NextResponse.json(await getVendorWebhookConfig(vendor.id));
}

export async function PUT(request: Request) {
  const vendor = await vendorFromPortalSession();
  if (!vendor) return NextResponse.json({ error: { message: "Unauthorized." } }, { status: 401 });
  const body = (await request.json()) as { url?: unknown };
  if (typeof body.url !== "string") {
    return NextResponse.json({ error: { message: "Webhook URL is required." } }, { status: 400 });
  }
  try {
    return NextResponse.json(await configureVendorWebhook(vendor.id, body.url));
  } catch (error) {
    return NextResponse.json(
      { error: { message: error instanceof Error ? error.message : "Unable to configure webhook." } },
      { status: 400 },
    );
  }
}

export async function DELETE() {
  const vendor = await vendorFromPortalSession();
  if (!vendor) return NextResponse.json({ error: { message: "Unauthorized." } }, { status: 401 });
  await disableVendorWebhook(vendor.id);
  return NextResponse.json({ disabled: true });
}
