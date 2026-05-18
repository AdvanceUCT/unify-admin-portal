/**
 * Shared CORS helpers for mock wallet API routes.
 * Wildcard origin is intentional — these routes are only used in dev/demo
 * and need to be reachable from the mobile wallet app on any origin.
 */
import { NextResponse } from "next/server";

const mockCorsHeaders = {
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
};

export function corsPreflight() {
  return new NextResponse(null, {
    headers: mockCorsHeaders,
    status: 204,
  });
}

export function jsonWithCors<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, {
    ...init,
    headers: {
      ...mockCorsHeaders,
      ...init?.headers,
    },
  });
}
