import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";

/** Request-local metadata only. Never attach financial instructions or raw errors. */
export type RefundTrace = { requestId: string; action: string; stage: string; attempts: number; startedAt: number };
export const refundTrace = new AsyncLocalStorage<RefundTrace>();
export function refundStage(stage: string) {
  const trace = refundTrace.getStore();
  if (trace) trace.stage = stage;
}
export function refundAttempt() {
  const trace = refundTrace.getStore();
  if (trace) trace.attempts++;
}
