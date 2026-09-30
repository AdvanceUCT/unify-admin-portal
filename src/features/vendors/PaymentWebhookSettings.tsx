"use client";
import { useCallback, useEffect, useState } from "react";

type Config = { id: string; url: string; enabled: boolean; branchIds: string[] };
type Attempt = { sequence: number; outcome: string; httpStatus: number | null; errorCode: string | null; startedAt: string; completedAt: string | null };
type Event = { id: string; eventType: string; requestId: string; createdAt: string; delivery: { status: string; nextAttemptAt: string | null; attempts: Attempt[] } | null };
type History = { items: Event[]; nextCursor: string | null; lastSuccess: string | null; oldestOutstanding: string | null };
const button = "rounded-md border border-border px-3 py-2 text-sm disabled:opacity-50";
function date(value: string | null) { return value ? new Date(value).toLocaleString() : "None"; }
export function PaymentWebhookSettings({ branches }: { branches: { id: string; name: string }[] }) {
  const [url, setUrl] = useState("");
  const [branchIds, setBranchIds] = useState<string[]>([]);
  const [config, setConfig] = useState<Config | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [history, setHistory] = useState<History>();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const base = "/api/vendor/integrations/payment-webhook";
  const load = useCallback(async () => {
    const [c, h] = await Promise.all([fetch(base, { cache: "no-store" }), fetch(`${base}/history`, { cache: "no-store" })]);
    if (!c.ok || !h.ok) throw new Error("Unable to load payment callback settings.");
    const configuration = await c.json() as Config | null;
    setConfig(configuration); setUrl(configuration?.url ?? ""); setBranchIds(configuration?.branchIds ?? []);
    setHistory(await h.json() as History);
  }, []);
  useEffect(() => { void Promise.resolve().then(load).catch((error: Error) => setMessage(error.message)); }, [load]);
  async function action(path: string, method: string, body?: unknown) {
    setBusy(true); setMessage(""); setSecret(null);
    try {
      const response = await fetch(`${base}${path}`, { method, headers: { "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "Unable to update delivery.");
      if (result.secret) setSecret(result.secret);
      await load();
      setMessage(method === "PUT" ? "Saved. Copy the new secret now; it is shown only once." : method === "DELETE" ? "Delivery disabled. Outstanding events are parked." : "Retry queued for the current destination.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to update delivery."); }
    finally { setBusy(false); }
  }
  async function nextPage() {
    if (!history?.nextCursor) return;
    setBusy(true);
    try {
      const response = await fetch(`${base}/history?cursor=${encodeURIComponent(history.nextCursor)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Unable to load history.");
      const next = await response.json() as History;
      setHistory({ ...next, items: [...history.items, ...next.items] });
    } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  }
  return <section className="space-y-4 rounded-xl border border-border bg-surface p-5">
    <h2 className="text-section-title">Payment callbacks</h2>
    <p className="text-sm text-fg-subtle">Separate from verification callbacks. Confirm every event against the payment request API and continue polling if delivery is unavailable.</p>
    <p className="text-sm">Delivery: {config?.enabled ? "Enabled" : "Disabled"}. Replacing configuration parks outstanding events. Retry below explicitly sends an old event to the current destination.</p>
    <label className="block text-sm">HTTPS destination<input type="url" value={url} onChange={(event) => setUrl(event.target.value)} className="mt-1 block w-full rounded border border-border bg-surface px-3 py-2" /></label>
    <fieldset><legend className="text-sm">Permitted payment branches</legend><div className="mt-2 flex flex-wrap gap-4">{branches.map((branch) => <label key={branch.id} className="flex gap-2 text-sm"><input type="checkbox" checked={branchIds.includes(branch.id)} onChange={(event) => setBranchIds(event.target.checked ? [...branchIds, branch.id] : branchIds.filter((id) => id !== branch.id))} />{branch.name}</label>)}</div></fieldset>
    <div className="flex flex-wrap gap-2"><button className={button} disabled={busy || !url || !branchIds.length} onClick={() => void action("", "PUT", { url, branchIds })}>Save replacement and reveal secret</button><button className={button} disabled={busy || !config?.enabled} onClick={() => void action("", "DELETE")}>Disable delivery</button><button className={button} disabled={busy} onClick={() => void load().catch((error: Error) => setMessage(error.message))}>Refresh history</button></div>
    {secret && <div className="rounded border border-border p-3"><p className="text-sm">Save this signing secret on your receiving server.</p><code className="break-all" data-payment-signing-secret>{secret}</code><button className={`${button} ml-2`} onClick={() => setSecret(null)}>Hide secret</button></div>}
    {message && <p role="status" className="text-sm">{message}</p>}
    <p className="text-sm">Last success: {date(history?.lastSuccess ?? null)} · Oldest outstanding: {date(history?.oldestOutstanding ?? null)}</p>
    <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Event / request</th><th className="p-2">Outcome</th><th className="p-2">Attempts</th><th className="p-2">Next retry</th><th className="p-2">Action</th></tr></thead><tbody>{history?.items.map((event) => <tr key={event.id} className="border-t border-border"><td className="p-2"><div>{event.eventType}</div><a href={`/vendor/payment-requests/${event.requestId}`} className="text-brand-600">{event.requestId}</a><div className="text-xs">{date(event.createdAt)}</div></td><td className="p-2">{event.delivery?.status ?? "No configured delivery"}</td><td className="p-2"><details><summary>{event.delivery?.attempts.length ?? 0} recent attempts</summary>{event.delivery?.attempts.map((attempt) => <p key={attempt.sequence}>#{attempt.sequence}: {attempt.outcome}{attempt.httpStatus ? ` HTTP ${attempt.httpStatus}` : ""}{attempt.errorCode ? ` (${attempt.errorCode})` : ""} · {date(attempt.startedAt)}</p>)}</details></td><td className="p-2">{date(event.delivery?.nextAttemptAt ?? null)}</td><td className="p-2"><button className={button} disabled={busy || !config?.enabled || event.delivery?.status === "IN_FLIGHT"} onClick={() => void action(`/events/${event.id}/retry`, "POST")}>Retry to current destination</button></td></tr>)}</tbody></table></div>
    {history?.nextCursor && <button className={button} disabled={busy} onClick={() => void nextPage()}>Load older events</button>}
  </section>;
}
