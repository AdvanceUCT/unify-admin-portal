import { useEffect, useState } from "react";
import { LivePaymentTable } from "../../src/app/vendor/(portal)/payments/LivePaymentTable";
import { LivePaymentList, type LivePaymentEvent } from "../../src/features/vendors/LivePaymentList";
import { formatMoneyMinor } from "../../src/lib/formatters";

declare global { interface Window { __refundRequests: Array<{ path: string; method: string }> } }
const scope = { vendorProfileId: "synthetic-vendor", operatorId: "user:synthetic-owner" };
const draft = { transactionId: "synthetic-spend-original-reference", amountMinor: 15000, idempotencyKey: "synthetic-frozen-key" };
const pending = { id: "synthetic-refund-operation", ...scope, originalTransactionId: draft.transactionId, paymentRequestId: null, branchId: "synthetic-branch", amountMinor: 15000, currency: "ZAR", idempotencyKey: draft.idempotencyKey, status: "PENDING", createdAt: "2026-10-24T08:52:00Z", resolvedAt: null };
const key = `unify.refund-registration.v1:${scope.vendorProfileId}:${scope.operatorId}`;
let balance = 5000;
let server: Record<string, unknown> | null = pending;
export function installRefundScenario(screen: string) {
  balance = 5000;
  server = screen === "refund-unacknowledged" ? null : { ...pending };
  window.__refundRequests = [];
  localStorage.setItem(key, JSON.stringify({ ...draft, ...(server ? { operationId: pending.id } : {}) }));
  const previous = window.fetch;
  window.fetch = async (request, options) => {
    const path = String(request);
    if (!path.includes("/refund-operations")) return previous(request, options);
    const method = options?.method ?? "GET";
    window.__refundRequests.push({ path, method });
    if (method === "GET") return Response.json(path.endsWith(pending.id) ? server : { ...scope, operation: server?.status === "PENDING" ? server : null });
    if (path.endsWith("/execute")) {
      await new Promise(resolve => setTimeout(resolve, 300));
      if (screen === "refund-error") return Response.json({ error: { code: "REFUND_TEMPORARILY_UNAVAILABLE", message: "We couldn’t confirm the refund outcome. Refresh its status before retrying. Keep the original reference.", requestId: "synthetic-correlation" } }, { status: 503 });
      balance = -10000;
      server = { ...pending, status: "COMPLETED", resolvedAt: "2026-10-24T09:00:00Z", result: {
        originalTransactionId: draft.transactionId, refundTransactionId: "synthetic-refund-posting", paymentRequestId: null,
        refundedAmountMinor: 15000, totalRefundedMinor: 15000, remainingRefundableMinor: 0, refundStatus: "FULLY_REFUNDED", vendorBalanceMinor: balance, replayed: false,
        refund: { id: "synthetic-refund-posting", amountMinor: 15000, currency: "ZAR", source: "PORTAL", createdAt: "2026-10-24T09:00:00Z" },
      } };
    } else if (path.endsWith("/cancel")) server = { ...pending, status: "CANCELLED", resolvedAt: "2026-10-24T09:00:00Z" };
    else server = { ...pending };
    return Response.json(server);
  };
}

const payment: LivePaymentEvent = {
  eventId: "synthetic-event", transactionId: draft.transactionId, branchId: "synthetic-branch", branchName: "Campus café",
  studentName: "Example Student", studentNumber: "EXAMPLE001", amountMinor: 15000, currency: "ZAR", completedAt: "2026-10-24T08:30:00Z",
  totalRefundedMinor: 0, remainingRefundableMinor: 15000, refundStatus: "NONE", canRefund: true,
};
export function RefundFixture({ screen }: { screen: string }) {
  const [walletBalance, setWalletBalance] = useState(balance);
  const [refreshes, setRefreshes] = useState(0);
  useEffect(() => {
    const refresh = () => { setWalletBalance(balance); setRefreshes(count => count + 1); };
    window.addEventListener("fixture-router-refresh", refresh);
    return () => window.removeEventListener("fixture-router-refresh", refresh);
  }, []);
  return <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
    <div className="border-b border-border px-5 py-5"><h1 className="text-2xl font-semibold">Payments</h1><p className="mt-2 text-sm text-fg-muted">Wallet balance <span data-testid="wallet-balance">{formatMoneyMinor(walletBalance)}</span></p></div>
    <span className="sr-only" data-testid="server-refreshes">{refreshes}</span>
    {screen === "refund-list" ? <LivePaymentList initialItems={[payment]} /> : <LivePaymentTable initialItems={[payment]} activePaymentBranchIds={[payment.branchId]} filters={{}} />}
  </section>;
}
