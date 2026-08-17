/**
 * @fileoverview Handles the `/api/ethereum/students/[ethAddress]/verified` API boundary, including its authorization and request validation.
 * @module app/api/ethereum/students/[ethAddress]/verified/route
 */

import { NextResponse } from "next/server";

import { EthereumServiceError, isStudentVerifiedOnChain } from "@/lib/ethereum/ethereumService";

/**
 * Handles GET requests to `/api/ethereum/students/[ethAddress]/verified`.
 * Called by the student's own wallet — not the admin portal — so it takes no admin session.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ ethAddress: string }> }) {
  const { ethAddress } = await params;

  try {
    const verified = await isStudentVerifiedOnChain(ethAddress);
    return NextResponse.json({ verified, ethAddress });
  } catch (error) {
    const status = error instanceof EthereumServiceError ? error.statusCode : 502;
    return NextResponse.json(
      { error: { message: error instanceof Error ? error.message : "Failed to read on-chain verification status." } },
      { status },
    );
  }
}
