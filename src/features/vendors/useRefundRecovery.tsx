"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { RefundRecoveryClient } from "@/lib/payments/refundRecoveryClient";
import { formatMoneyMinor } from "@/lib/formatters";

/**
 * Share one recovery controller across this refund list's renders and rehydrate on focus or cross-tab storage changes.
 * Block new instructions until hydration succeeds or a pending reference resolves; refresh authoritative totals once per completed refund.
 */
export function useRefundRecovery() {
  const router = useRouter();
  const refreshedRefund = useRef<string | undefined>(undefined);
  const [client] = useState(() => new RefundRecoveryClient({ baseUrl: "/api/vendor/refund-operations", storage: () => localStorage }));
  const state = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getServerSnapshot);
  useEffect(() => {
    void client.hydrate();
    const refresh = () => { void client.hydrate(); };
    window.addEventListener("storage", refresh);
    window.addEventListener("focus", refresh);
    return () => { window.removeEventListener("storage", refresh); window.removeEventListener("focus", refresh); };
  }, [client]);
  useEffect(() => {
    const result = state.outcome?.result;
    if (result && refreshedRefund.current !== result.refundTransactionId) {
      refreshedRefund.current = result.refundTransactionId;
      router.refresh();
    }
  }, [state.outcome, router]);
  return { client, state, blocked: !state.hydrated || state.busy || Boolean(state.draft || state.operation) };
}

const actionClass = "rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-fg-muted transition hover:bg-brand-50 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-60";

export function RefundRecoveryPanel({ recovery }: { recovery: ReturnType<typeof useRefundRecovery> }) {
  const { state, client } = recovery;
  const draft = state.draft;
  return <div className="px-5 py-3 text-sm" aria-live="polite">
    {!state.hydrated && !state.error ? <p>Checking pending refunds…</p> : null}
    {draft ? <div className="space-y-2"><p className="break-words">Pending refund {formatMoneyMinor(draft.amountMinor)} · {state.operation?.originalTransactionId ?? draft.transactionId ?? draft.paymentRequestId}</p><div className="flex flex-wrap gap-3"><button className={actionClass} type="button" disabled={state.busy} onClick={() => void client.recover()}>{state.busy ? "Working…" : "Retry refund"}</button><button className={actionClass} type="button" disabled={state.busy} onClick={() => void client.recover("cancel")}>Cancel pending refund</button></div></div> : null}
    {state.error ? <p role="alert">{state.error}</p> : null}
    {draft || state.error ? <button className={actionClass} type="button" disabled={state.busy} onClick={() => void client.hydrate()}>Refresh status</button> : null}
    {state.outcome?.status === "REJECTED" ? <p>{state.outcome.rejection?.message}</p> : null}
    {state.outcome?.status === "CANCELLED" ? <p>Refund cancelled.</p> : null}
  </div>;
}
