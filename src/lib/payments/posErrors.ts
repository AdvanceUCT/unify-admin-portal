import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { walletErrorResponse } from "./walletApi";

export class PosApiError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 400) { super(message); }
}
export function posErrorResponse(error: unknown) {
  if (error instanceof PosApiError) return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  if (error instanceof ZodError || error instanceof SyntaxError) return NextResponse.json({ error: { code: "INVALID_REQUEST", message: "Invalid payment request." } }, { status: 400 });
  return walletErrorResponse(error);
}
