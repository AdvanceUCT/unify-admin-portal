/**
 * @fileoverview Handles the `/api/ethereum/network/status` API boundary, including its authorization and request validation.
 * @module app/api/ethereum/network/status/route
 */

import { NextResponse } from "next/server";

import { getNetworkStatus } from "@/lib/ethereum/ethereumService";

/** Handles GET requests to `/api/ethereum/network/status`. No auth required. */
export async function GET() {
  const status = await getNetworkStatus();
  return NextResponse.json(status);
}
