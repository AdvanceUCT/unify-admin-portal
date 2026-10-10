"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { VENDOR_API_SCOPES, type VendorApiScope } from "@/lib/vendors/apiScopes";
import { keyPresets, scopeLabels, type IntegrationBranch } from "@/lib/vendors/integrationGuide";
import { button, input, primary, Secret, localDate, CopyButton } from "./IntegrationUi";

export type IntegrationKey = { id: string; name: string; keyPrefix: string; createdAt: string; lastUsedAt: string | null; revokedAt: string | null; scopes: string[]; branchIds: string[] };
export function VendorIntegrationSettings({ branches, initialApiKeys, initialPreset = "verification" }: { branches: IntegrationBranch[]; initialApiKeys: IntegrationKey[]; initialPreset?: "verification" | "payments" }) {
  const [keys, setKeys] = useState(initialApiKeys);
  const [preset, setPreset] = useState<"verification" | "payments" | "custom">(initialPreset);
  const [scopes, setScopes] = useState<VendorApiScope[]>([...keyPresets[initialPreset]]);
  const [branchIds, setBranchIds] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const locked = useRef(false);
  const needsBranches = scopes.some(s => s.startsWith("payments:") || s === "refunds:create");
  const defaultBranch = branches.find(b => b.isDefault);
  const validation = !name.trim() ? "Enter a key name." : !scopes.length ? "Select at least one permission." : needsBranches && !branchIds.length ? "Select the branches this key can access." : scopes.includes("verification:create") && branchIds.length > 0 && !branchIds.includes(defaultBranch?.id ?? "") ? "Include the default branch to start checkout verification." : "";
  const base = "/api/vendor/integrations/api-keys";

  function choosePreset(value: typeof preset) {
    setPreset(value);
    if (value !== "custom") { setScopes([...keyPresets[value]]); setBranchIds([]); }
  }
  async function refresh() {
    const response = await fetch(base, { cache: "no-store" });
    if (!response.ok) throw new Error("Unable to refresh key history.");
    setKeys(await response.json() as IntegrationKey[]);
  }
  async function create() {
    if (locked.current) return;
    if (validation) { setMessage(validation); return; }
    if (token && !window.confirm("The previous key will be hidden. Have you saved it on your server?")) return;
    locked.current = true; setBusy(true); setMessage(""); setToken(null);
    let rejected = false;
    try {
      const response = await fetch(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, scopes, branchIds }) });
      const result = await response.json();
      if (!response.ok) { rejected = true; throw new Error(result.error?.message ?? "Unable to create key."); }
      if (typeof result.token !== "string" || typeof result.id !== "string" || typeof result.prefix !== "string") throw new Error("Invalid key response.");
      setToken(result.token);
      setKeys(current => [{ id: result.id, name: result.name, keyPrefix: result.prefix, createdAt: result.createdAt, lastUsedAt: null, revokedAt: null, scopes: result.scopes, branchIds: result.branchIds }, ...current]);
      setName(""); setMessage("Key created. Copy it before leaving this page.");
    } catch (error) {
      setMessage(rejected ? (error instanceof Error ? error.message : "Unable to create key.") : "The result could not be confirmed. A key may have been created. Review the refreshed key list before creating another; a lost secret requires revocation and replacement.");
      if (!rejected) await refresh().catch(() => setMessage("Unable to confirm creation or refresh keys. Reload key history before creating another key."));
    } finally { locked.current = false; setBusy(false); }
  }
  async function revoke(key: IntegrationKey) {
    if (locked.current || !window.confirm(`Revoke ${key.name}? Requests using this key will stop working. Existing sales and callback settings remain intact. Pending refunds remain bound to their original operator.`)) return;
    locked.current = true; setBusy(true); setMessage("");
    try {
      const response = await fetch(`${base}/${encodeURIComponent(key.id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Unable to confirm revocation. Refresh the key list before retrying.");
      setKeys(current => current.map(k => k.id === key.id ? { ...k, revokedAt: new Date().toISOString() } : k));
      if (token?.startsWith(`unify_vk_${key.keyPrefix}_`)) setToken(null);
      setMessage("Key revoked.");
    } catch { setMessage("Unable to confirm revocation. Refresh the key list before retrying."); }
    finally { locked.current = false; setBusy(false); }
  }
  return <div className="space-y-8">
    <section className="space-y-4"><h2 className="text-section-title">Create API key</h2><p className="text-sm text-fg-muted">Keep this key on your server. A callback signing secret is a separate credential.</p>
      <fieldset disabled={busy} className="max-w-2xl space-y-4">
        <label className="block text-sm">Key name<input className={input} value={name} onChange={e => setName(e.target.value)} placeholder="Website checkout or campus till" /></label>
        <label className="block text-sm">Use this key for<select className={input} value={preset} onChange={e => choosePreset(e.target.value as typeof preset)}><option value="verification">Student verification</option><option value="payments">Wallet payments</option><option value="custom">Custom permissions</option></select></label>
        {preset === "payments" && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={scopes.includes("refunds:create")} onChange={e => setScopes(e.target.checked ? [...scopes, "refunds:create"] : scopes.filter(s => s !== "refunds:create"))} />Allow refunds and refund recovery</label>}
        {preset === "custom" ? <fieldset className="space-y-2"><legend className="mb-2 text-sm font-medium">Permissions</legend>{VENDOR_API_SCOPES.map(s => <label key={s} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={scopes.includes(s)} onChange={e => setScopes(e.target.checked ? [...scopes, s] : scopes.filter(v => v !== s))} />{scopeLabels[s]}</label>)}</fieldset> : <ul className="space-y-1 text-sm text-fg-muted">{scopes.map(s => <li key={s}>{scopeLabels[s]}</li>)}</ul>}
        <details className="text-sm text-fg-muted"><summary className="cursor-pointer">Technical scopes</summary><code className="mt-2 block break-all">{scopes.join(", ") || "None selected"}</code></details>
        <fieldset className="space-y-2"><legend className="mb-1 text-sm font-medium">Branch access {needsBranches ? "(required)" : "(optional)"}</legend><p className="text-sm text-fg-muted">{needsBranches ? "Choose explicit branches. Inactive branches may be retained for authorized recovery; new financial operations still require eligibility." : "With no branch restriction, verification uses the default branch."}</p>{branches.map(b => <label key={b.id} className="flex items-start gap-2 py-1 text-sm"><input className="mt-1" type="checkbox" checked={branchIds.includes(b.id)} onChange={e => setBranchIds(e.target.checked ? [...branchIds, b.id] : branchIds.filter(id => id !== b.id))} /><span>{b.name}{b.isDefault ? " · Default verification branch" : ""}<span className="block text-xs text-fg-muted">{b.active ? b.status : "Inactive"} · Payments: {b.paymentStatus ?? "Not enabled"}</span></span></label>)}{!branches.length && <p className="text-sm text-fg-muted">No branches yet. <Link className="underline" href="/vendor/branches">Review branches</Link></p>}</fieldset>
        <p className="text-sm text-fg-muted">A restricted verification key must include the default branch. Permissions are fixed; create a replacement key to change them.</p>
      </fieldset>
      <button className={primary} type="button" disabled={busy || Boolean(validation)} onClick={() => void create()}>{busy ? "Updating…" : "Create API key"}</button>
      {validation && <p className="text-xs text-fg-muted">{validation}</p>}
      {token && <Secret value={token} label="API key" onHide={() => setToken(null)} />}
      <p role="status" className="text-sm text-fg-muted">{message}</p>
    </section>
    <section className="space-y-4 border-t border-border pt-5"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-section-title">Your API keys</h2><button type="button" className={button} disabled={busy} onClick={() => void refresh().then(() => setMessage("Key history refreshed.")).catch(() => setMessage("Unable to refresh keys. Try again."))}>Refresh keys</button></div>
      {keys.length === 0 && <p className="text-sm text-fg-muted">No API keys created.</p>}
      <ul className="divide-y divide-border">{keys.map(key => <li key={key.id} className="space-y-2 py-4"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-medium text-fg">{key.name}</h3>{key.revokedAt ? <Badge tone="danger">Revoked</Badge> : <button className={button} disabled={busy} type="button" onClick={() => void revoke(key)}>Revoke {key.name}</button>}</div><code className="text-xs text-fg-muted">unify_vk_{key.keyPrefix}_…</code><p className="text-sm">{key.scopes.map(s => scopeLabels[s as VendorApiScope] ?? s).join(" · ")}</p><p className="text-sm text-fg-muted">Branches: {key.branchIds.map(id => branches.find(b => b.id === id)?.name ?? `Unavailable branch (${id})`).join(", ") || "Default verification branch"}</p><p className="text-xs text-fg-muted">Created {localDate(key.createdAt)} · Last used {localDate(key.lastUsedAt)}{key.revokedAt ? ` · Revoked ${localDate(key.revokedAt)}` : ""}</p></li>)}</ul>
    </section>
    <section className="space-y-3 border-t border-border pt-5"><h2 className="text-section-title">Branch IDs for your developer</h2>{branches.map(b => <div key={b.id} className="flex flex-wrap items-center gap-3 text-sm"><span>{b.name}</span><code className="break-all">{b.id}</code><CopyButton value={b.id} label={`Copy ${b.name} branch ID`} /></div>)}</section>
  </div>;
}
