import "server-only";
import { NextResponse } from "next/server";
import { posErrorResponse } from "./posErrors";
import { requestIdFrom } from "@/lib/requestId";
import { refundTrace, type RefundTrace } from "./refundTrace";

const unavailableMessage = "We couldn’t confirm the refund outcome. Refresh its status before retrying. Keep the original reference.";
const databaseCodes = new Set(["P1000", "P1001", "P1002", "P1008", "P1011", "P1017", "P2024", "P2028", "P2034", "40001", "40P01", "53300", "57P01", "57P02", "57P03", "ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "EPIPE"]);
function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : undefined;
}
function safeCode(value: unknown) {
  return typeof value === "string" && /^(?:P\d{4}|[0-9A-Z]{5}|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EPIPE)$/.test(value) ? value : undefined;
}
export function refundDatabaseFailure(error: unknown) {
  const outer = record(error);
  const meta = record(outer?.meta);
  const adapter = record(meta?.driverAdapterError);
  const cause = record(adapter?.cause) ?? record(outer?.cause);
  const codes = [outer?.code, meta?.code, cause?.originalCode, cause?.code].map(safeCode).filter((code): code is string => Boolean(code));
  const databaseCode = codes.find(code => databaseCodes.has(code) || code.startsWith("08"));
  return { unavailable: Boolean(databaseCode), code: databaseCode ?? codes[0] ?? "UNKNOWN" };
}

/** All refund endpoints share safe diagnostics and outcome-unknown handling. */
export async function withRefundRequest(request: Request, action: string, operation: () => Promise<Response>) {
  const trace: RefundTrace = { requestId: requestIdFrom(request.headers.get("x-request-id")), action, stage: "authorization", attempts: 0, startedAt: Date.now() };
  return refundTrace.run(trace, async () => {
    try {
      const response = await operation();
      response.headers.set("X-Request-ID", trace.requestId);
      response.headers.set("Cache-Control", "private, no-store, max-age=0");
      if (response.status < 400) return response;
      const body = await response.json();
      return NextResponse.json({ ...body, error: { ...body.error, requestId: trace.requestId } }, { status: response.status, headers: response.headers });
    } catch (error) {
      const database = refundDatabaseFailure(error);
      const response = database.unavailable
        ? NextResponse.json({ error: { code: "REFUND_TEMPORARILY_UNAVAILABLE", message: unavailableMessage } }, { status: 503 })
        : posErrorResponse(error);
      if (response.status >= 500) {
        console.error("refund_request_failed", {
          requestId: trace.requestId, action: trace.action, stage: trace.stage,
          elapsedMs: Math.max(0, Date.now() - trace.startedAt), attempts: trace.attempts,
          databaseCode: database.code, category: database.unavailable ? "database_unavailable" : "unexpected",
        });
      }
      const body = await response.json();
      return NextResponse.json({ ...body, error: { ...body.error, requestId: trace.requestId } }, {
        status: response.status, headers: { "X-Request-ID": trace.requestId, "Cache-Control": "private, no-store, max-age=0" },
      });
    }
  });
}
