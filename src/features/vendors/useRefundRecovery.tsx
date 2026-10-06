"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { RefundRecoveryClient } from "@/lib/payments/refundRecoveryClient";
import { formatMoneyMinor } from "@/lib/formatters";

export function useRefundRecovery() {
  const [client] = useState(() => new RefundRecoveryClient({ baseUrl: "/api/vendor/refund-operations", storage: () => localStorage }));
  const state = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getServerSnapshot);
  useEffect(() => {
    void client.hydrate();
    const refresh = () => { void client.hydrate(); };
    window.addEventListener("storage", refresh);
    window.addEventListener("focus", refresh);
    return () => { window.removeEventListener("storage", refresh); window.removeEventListener("focus", refresh); };
  }, [client]);
  return { client, state, blocked: !state.hydrated || state.busy || Boolean(state.draft || state.operation) };
}

export function RefundRecoveryPanel({ recovery }: { recovery: ReturnType<typeof useRefundRecovery> }) {
  const { state, client } = recovery;
  const draft = state.draft;
  return <div className="px-5 py-3 text-sm" aria-live="polite">
    {!state.hydrated && !state.error ? <p>Checking pending refunds…</p> : null}
    {draft ? <div className="space-y-2"><p>Pending refund {formatMoneyMinor(draft.amountMinor)} · {state.operation?.originalTransactionId ?? draft.transactionId ?? draft.paymentRequestId}</p><div className="flex gap-3"><button type="button" disabled={state.busy} onClick={() => void client.recover()}>Check refund</button><button type="button" disabled={state.busy} onClick={() => void client.recover("cancel")}>Cancel pending refund</button></div></div> : null}
    {state.error ? <p role="alert">{state.error} <button type="button" disabled={state.busy} onClick={() => void client.hydrate()}>Retry recovery</button></p> : null}
    {state.outcome?.status === "REJECTED" ? <p>{state.outcome.rejection?.message}</p> : null}
    {state.outcome?.status === "CANCELLED" ? <p>Refund cancelled.</p> : null}
  </div>;
}
