"use client";
import { useIntegrationLifetime } from "./useIntegrationLifetime";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { signatureExample, type IntegrationBranch } from "@/lib/vendors/integrationGuide";
import { button, primary, input, Secret, CodeBlock, localDate } from "./IntegrationUi";

type Kind = "verification" | "payments";
type Config = { url: string; enabled: boolean; branchIds?: string[] };
type VerificationAttempt = { id: string; verificationId: string; verificationRequestId: string | null; checkoutId: string | null; verificationStatus: string; attemptNumber: number; status: string; httpStatus: number | null; attemptedAt: string; failureReason: string | null };
type PaymentEvent = { id: string; eventType: string; requestId: string; createdAt: string; delivery: { status: string; nextAttemptAt: string | null; attempts: { sequence: number; outcome: string; httpStatus: number | null; errorCode: string | null; startedAt: string }[] } | null };
type History = { items: (VerificationAttempt | PaymentEvent)[]; nextCursor: string | null; lastSuccess: string | null; oldestOutstanding?: string | null };
const statuses: Record<string, string> = { DELIVERED: "Delivered", FAILED: "Failed", READY: "Awaiting delivery", IN_FLIGHT: "Sending", PARKED: "Parked", EXHAUSTED: "Retries exhausted", STARTED: "Sending", INTERRUPTED: "Interrupted" };

export function CallbackSettings({ kind, branches }: { kind: Kind; branches: IntegrationBranch[] }) {
  const base = `/api/vendor/integrations/${kind === "payments" ? "payment-webhook" : "webhook"}`;
  const lifetime = useIntegrationLifetime();
  const [config, setConfig] = useState<Config | null>(null);
  const [url, setUrl] = useState("");
  const [branchIds, setBranchIds] = useState<string[]>([]);
  const [history, setHistory] = useState<History | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [configError, setConfigError] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [busy, setBusy] = useState(true);
  const [historyBusy, setHistoryBusy] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const locked = useRef(false);
  const sequence = useRef(0);
  const historySequence = useRef(0);
  const readHistory = useCallback(async (cursor?: string) => {
    const response = await fetch(`${base}/history${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`, { cache: "no-store" });
    if (!response.ok) throw new Error("Unable to load webhook history. Try again.");
    const result = await response.json() as History;
    if (!Array.isArray(result.items)) throw new Error("Unable to read webhook history. Try again.");
    return result;
  }, [base]);
  const reload = useCallback(async () => {
    const current = lifetime.capture(); const generation = ++sequence.current;
    const response = await fetch(base, { cache: "no-store" });
    if (!response.ok) throw new Error("Unable to load webhook configuration. Try again.");
    const next = await response.json() as Config | null;
    if (!lifetime.isCurrent(current) || generation !== sequence.current) return;
    setConfig(next); setUrl(next?.url ?? ""); setBranchIds(next?.branchIds ?? []); setLoaded(true); setConfigError("");
  }, [base, lifetime]);
  useEffect(() => {
    let active = true;
    void reload().catch(() => { if (active) setConfigError("Unable to load webhooks. Reload configuration to try again."); }).finally(() => { if (active) setBusy(false); });
    void readHistory().then(next => { if (active) setHistory(next); }).catch(() => { if (active) setHistoryError("Unable to load webhook history. Refresh history to try again."); }).finally(() => { if (active) setHistoryBusy(false); });
    return () => { active = false; };
  }, [reload, readHistory]);
  async function refreshHistory(append = false) {
    if (historyBusy) return;
    const current = lifetime.capture(); const generation = ++historySequence.current;
    setHistoryBusy(true);
    try { const next = await readHistory(append ? history?.nextCursor ?? undefined : undefined); if (!lifetime.isCurrent(current) || generation !== historySequence.current) return; setHistory(previous => ({ ...next, items: append ? [...(previous?.items ?? []), ...next.items] : next.items })); setHistoryError(""); }
    catch { if (lifetime.isCurrent(current)) setHistoryError("Unable to load webhook history. Refresh history to try again."); }
    finally { if (lifetime.isCurrent(current)) setHistoryBusy(false); }
  }
  async function run(action: "save" | "disable" | "retry", row?: VerificationAttempt | PaymentEvent) {
    if (locked.current) return;
    if (action === "save") {
      if (!url.trim() || kind === "payments" && !branchIds.length) { setMessage("Enter an HTTPS destination and select any required branches."); return; }
      if ((config || secret) && !window.confirm(kind === "payments" ? "Replace payment delivery and rotate its secret? Outstanding deliveries will be parked; retry them explicitly to the new destination." : "Replace the verification webhook signing secret? Update your receiving server; the old secret will stop verifying new deliveries.")) return;
    }
    if (action === "disable" && !window.confirm("Disable webhook delivery? Continue polling authoritative results.")) return;
    if (action === "retry" && (!row || !window.confirm("Send this event again to the current destination? Deduplicate repeated events. The underlying result will not change."))) return;
    const current = lifetime.capture(); locked.current = true; setBusy(true); setMessage("");
    if (action === "save") setSecret(null);
    const path = action !== "retry" ? base : kind === "payments" ? `${base}/events/${encodeURIComponent(row!.id)}/retry` : `/api/vendor/verifications/${encodeURIComponent((row as VerificationAttempt).verificationRequestId!)}/retry`;
    try {
      const response = await fetch(path, { method: action === "save" ? "PUT" : action === "disable" ? "DELETE" : "POST", headers: { "Content-Type": "application/json" }, ...(action === "save" ? { body: JSON.stringify({ url: url.trim(), ...(kind === "payments" ? { branchIds } : {}) }) } : {}) });
      const result = await response.json();
      if (!lifetime.isCurrent(current)) return;
      if (!response.ok) throw new Error(result.error?.message ?? "The update could not be confirmed.");
      if (action === "save") { const nextSecret = kind === "payments" ? result.secret : result.signingSecret; if (typeof nextSecret !== "string") throw new Error("A lost secret requires explicit replacement."); setSecret(nextSecret); }
      if (action === "disable") setSecret(null);
      setMessage(action === "save" ? "Saved. Copy the new secret before leaving this page." : action === "disable" ? "Delivery disabled." : kind === "payments" ? "Retry queued for the current destination." : result.status === "DELIVERED" ? "Webhook delivered." : result.skipped ? "No delivery was attempted. Check the configuration and checkout reference." : "Delivery failed. Check your receiving server and history.");
      if (action !== "retry") { try { await reload(); } catch { if (lifetime.isCurrent(current)) setConfigError("Update acknowledged, but settings could not be reloaded. Keep any new secret and reload configuration."); } }
      if (lifetime.isCurrent(current)) await refreshHistory();
    } catch (error) { if (lifetime.isCurrent(current)) setMessage(`${error instanceof Error ? error.message : "The result could not be confirmed."} Do not automatically repeat the request. Reload configuration before retrying.`); }
    finally { locked.current = false; if (lifetime.isCurrent(current)) setBusy(false); }
  }
  async function reloadConfiguration() {
    if (locked.current || loaded && (url !== (config?.url ?? "") || JSON.stringify(branchIds) !== JSON.stringify(config?.branchIds ?? [])) && !window.confirm("Discard unsaved edits and reload the saved configuration?")) return;
    const current = lifetime.capture(); locked.current = true; setBusy(true);
    try { await reload(); if (lifetime.isCurrent(current)) setMessage("Saved configuration reloaded."); }
    catch { if (lifetime.isCurrent(current)) setConfigError("Unable to load webhooks. Reload configuration to try again."); }
    finally { locked.current = false; if (lifetime.isCurrent(current)) setBusy(false); }
  }
  return <div className="min-w-0 space-y-8">
    <section id="webhooks" className="scroll-mt-44 space-y-4 border-t border-border pt-7"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-2xl font-semibold">Webhooks</h2><Badge tone={loaded && config?.enabled ? "success" : "neutral"}>{!loaded ? "Configuration not loaded" : config?.enabled ? "Configured" : "Disabled"}</Badge></div><p className="text-sm text-fg-muted">Optional. Receive signed results on your server. The signing secret is separate from your API key.</p>
      {!loaded && busy && <p role="status" className="text-sm">Loading webhook settings…</p>}
      {configError && <p role="alert" className="text-danger-fg">{configError}</p>}
      <fieldset disabled={busy || !loaded} className="max-w-2xl space-y-4"><label className="block text-sm">HTTPS destination<input type="url" className={input} value={url} onChange={e => setUrl(e.target.value)} placeholder="https://your-server.example/unify/events" /></label>
        {kind === "payments" && <fieldset className="space-y-2"><legend className="mb-1 text-sm font-medium">Payment branches</legend>{branches.map(b => { const eligible = b.active && b.status === "ACTIVE" && b.paymentStatus === "ACTIVE"; return <label key={b.id} className="flex items-start gap-2 text-sm"><input type="checkbox" checked={branchIds.includes(b.id)} disabled={!eligible && !branchIds.includes(b.id)} onChange={e => setBranchIds(e.target.checked ? [...branchIds, b.id] : branchIds.filter(id => id !== b.id))} /><span>{b.name}<span className="block text-xs text-fg-muted">{eligible ? "Accepts payments" : "Not accepting payments; remove from a replacement configuration"}</span></span></label>; })}{!branches.length && <p className="text-sm text-fg-muted">No branches available. <Link href="/vendor/branches" className="underline">Review branches</Link></p>}</fieldset>}
      </fieldset>
      <div className="flex flex-wrap gap-2"><button type="button" className={primary} disabled={busy || !loaded || !url.trim() || kind === "payments" && (!branchIds.length || branchIds.some(id => !branches.some(b => b.id === id && b.active && b.status === "ACTIVE" && b.paymentStatus === "ACTIVE")))} onClick={() => void run("save")}>{config ? "Save and replace secret" : "Save and reveal secret"}</button><button type="button" className={button} disabled={busy || !config?.enabled} onClick={() => void run("disable")}>Disable delivery</button><button type="button" className={button} disabled={busy} onClick={() => void reloadConfiguration()}>Reload configuration</button></div>
      {secret && <Secret label={`${kind === "payments" ? "Payment" : "Verification"} signing secret`} value={secret} onHide={() => setSecret(null)} />}
      <p role="status" className="text-sm text-fg-muted">{message}</p>
    <div className="space-y-3 pt-2"><p className="text-sm text-fg-muted">{kind === "payments" ? 'Payments use HMAC-SHA256 over timestamp + "." + the exact raw body, with a five-minute timestamp tolerance.' : "Verification uses HMAC-SHA256 over the exact raw body, without the payment timestamp prefix."}</p><details><summary className="cursor-pointer text-sm font-medium">Node.js signature example</summary><div className="mt-3"><CodeBlock code={signatureExample(kind)} label={`${kind} signature verification`} /></div></details><p className="text-sm text-fg-muted">{kind === "payments" ? "Deduplicate event IDs before fulfillment. Payment events include paid, cancelled, expired and refunded. Refund events must match a refund in the authoritative sale's refunds[]; later refunds may already exist." : "Deduplicate event IDs and match the original checkoutId before acting. Reread the verification decision using its verificationRequestId."} Callback failure never reverses a decision or payment. Continue polling when delivery is unavailable.</p></div>
    </section>
    <section id="delivery-history" className="scroll-mt-44 space-y-4 border-t border-border pt-7"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-2xl font-semibold">Delivery history</h2><button type="button" className={button} disabled={historyBusy} onClick={() => void refreshHistory()}>Refresh history</button></div>
      <p className="text-sm text-fg-muted">Last recorded success across destinations: {localDate(history?.lastSuccess ?? null)}{kind === "payments" ? ` · Oldest outstanding: ${localDate(history?.oldestOutstanding ?? null)}` : ""}</p>
      <p className="text-sm text-fg-muted">{kind === "payments" ? "Failed delivery retries automatically up to six attempts. Replacing or disabling delivery parks outstanding events. Explicit retry starts a fresh budget at the current destination." : "Verification webhooks support manual retry. Historical destinations were not recorded."}</p>
      {history?.items.length === 0 && <p className="py-4 text-sm text-fg-muted">No webhook attempts recorded yet. Check an authoritative result on your server.</p>}
      {historyBusy && <p role="status">Loading webhook history…</p>}
      {historyError && <p role="alert" className="text-danger-fg">{historyError}</p>}
      {Boolean(history?.items.length) && <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><caption className="sr-only">{kind} callback delivery history</caption><thead><tr>{["Reference", "Delivery", "Attempt details", "Action"].map(title => <th key={title} scope="col" className="p-2">{title}</th>)}</tr></thead><tbody>{history?.items.map(row => {
        const verification = "verificationId" in row ? row : null;
        const payment = "eventType" in row ? row : null;
        const status = verification?.status ?? payment?.delivery?.status;
        return <tr key={row.id} className="border-t border-border"><td className="max-w-64 break-all p-2 align-top">{verification ? <><Link className="text-brand-600 underline" href={`/vendor/verifications?q=${encodeURIComponent(verification.checkoutId ?? verification.verificationRequestId ?? "")}`}>{verification.checkoutId ?? verification.verificationRequestId}</Link><div className="text-xs text-fg-muted">{verification.verificationRequestId} · {verification.verificationStatus}</div></> : <><div>{payment!.eventType}</div><Link className="text-brand-600 underline" href={`/vendor/payment-requests/${encodeURIComponent(payment!.requestId)}`}>{payment!.requestId}</Link></>}<div className="mt-1 text-xs text-fg-muted">{localDate(verification?.attemptedAt ?? payment!.createdAt)}</div></td>
          <td className="p-2 align-top">{status ? statuses[status] ?? status : "No configured delivery"}{verification?.failureReason && <p className="text-xs text-fg-muted">{verification.failureReason}</p>}{payment?.delivery?.nextAttemptAt && <p className="text-xs text-fg-muted">Next retry: {localDate(payment.delivery.nextAttemptAt)}</p>}</td>
          <td className="p-2 align-top">{verification ? `#${verification.attemptNumber}${verification.httpStatus !== null ? ` · HTTP ${verification.httpStatus}` : ""}` : <details><summary className="cursor-pointer">{payment!.delivery?.attempts.length ?? 0} recent attempts</summary>{payment!.delivery?.attempts.map(a => <p key={a.sequence} className="mt-2 text-xs">#{a.sequence}: {statuses[a.outcome] ?? a.outcome}{a.httpStatus !== null ? ` · HTTP ${a.httpStatus}` : ""}{a.errorCode ? ` · ${a.errorCode}` : ""} · {localDate(a.startedAt)}</p>)}</details>}</td>
          <td className="p-2 align-top"><button className={button} type="button" disabled={busy || !config?.enabled || status === "IN_FLIGHT" || Boolean(verification && !verification.verificationRequestId)} onClick={() => void run("retry", row)}>Retry to current destination</button></td>
        </tr>;
      })}</tbody></table></div>}
      {history?.nextCursor && <button type="button" className={button} disabled={historyBusy} onClick={() => void refreshHistory(true)}>Load older attempts</button>}
    </section>

  </div>;
}
