"use client";
import { useIntegrationLifetime } from "./useIntegrationLifetime";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { signatureExample, type IntegrationBranch } from "@/lib/vendors/integrationGuide";
import { button, primary, input, Secret, CodeBlock } from "./IntegrationUi";

type Kind = "verification" | "payments";
type Config = { url: string; enabled: boolean; branchIds?: string[] };
export function CallbackSettings({ kind, branches }: { kind: Kind; branches: IntegrationBranch[] }) {
  const base = `/api/vendor/integrations/${kind === "payments" ? "payment-webhook" : "webhook"}`;
  const lifetime = useIntegrationLifetime();
  const [config, setConfig] = useState<Config | null>(null);
  const [url, setUrl] = useState("");
  const [branchIds, setBranchIds] = useState<string[]>([]);
  const [secret, setSecret] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [configError, setConfigError] = useState("");
  const [busy, setBusy] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const locked = useRef(false);
  const sequence = useRef(0);
  /**
   * Read the current webhook configuration and discard obsolete navigation/read results.
   * Loading settings never saves a configuration or rotates its secret.
   */
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
    return () => { active = false; };
  }, [reload]);
  /**
   * Confirm replacement/disable effects and perform one explicit settings mutation.
   * A save rotates the secret and reveals it once; uncertain errors prompt a read before retry instead of repeating rotation.
   */
  async function run(action: "save" | "disable") {
    if (locked.current) return;
    if (action === "save") {
      if (!url.trim() || kind === "payments" && !branchIds.length) { setMessage("Enter an HTTPS destination and select any required branches."); return; }
      if ((config || secret) && !window.confirm(kind === "payments" ? "Replace payment delivery and rotate its secret? Outstanding deliveries will be parked; retry them explicitly to the new destination." : "Replace the verification webhook signing secret? Update your receiving server; the old secret will stop verifying new deliveries.")) return;
    }
    if (action === "disable" && !window.confirm("Disable webhook delivery? Continue polling authoritative results.")) return;
    const current = lifetime.capture(); locked.current = true; setBusy(true); setMessage("");
    if (action === "save") setSecret(null);
    try {
      const response = await fetch(base, { method: action === "save" ? "PUT" : "DELETE", headers: { "Content-Type": "application/json" }, ...(action === "save" ? { body: JSON.stringify({ url: url.trim(), ...(kind === "payments" ? { branchIds } : {}) }) } : {}) });
      const result = await response.json();
      if (!lifetime.isCurrent(current)) return;
      if (!response.ok) throw new Error(result.error?.message ?? "The update could not be confirmed.");
      if (action === "save") { const nextSecret = kind === "payments" ? result.secret : result.signingSecret; if (typeof nextSecret !== "string") throw new Error("A lost secret requires explicit replacement."); setSecret(nextSecret); }
      if (action === "disable") setSecret(null);
      setMessage(action === "save" ? "Saved. Copy the new secret before leaving this page." : "Delivery disabled.");
      try { await reload(); } catch { if (lifetime.isCurrent(current)) setConfigError("Update acknowledged, but settings could not be reloaded. Keep any new secret and reload configuration."); }

    } catch (error) { if (lifetime.isCurrent(current)) setMessage(`${error instanceof Error ? error.message : "The result could not be confirmed."} Do not automatically repeat the request. Reload configuration before retrying.`); }
    finally { locked.current = false; if (lifetime.isCurrent(current)) setBusy(false); }
  }
  /**
   * Confirm before discarding unsaved edits, then reload saved settings without issuing another mutation.
   */
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

  </div>;
}
