"use client";

import { Check, Copy, KeyRound, Power, RotateCw, Trash2, Webhook } from "lucide-react";
import { useState } from "react";

type ApiKeySummary = {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

export function VendorIntegrationSettings({
  initialApiKeys,
  initialWebhook,
}: {
  initialApiKeys: ApiKeySummary[];
  initialWebhook: { url: string; enabled: boolean } | null;
}) {
  const [apiKeys, setApiKeys] = useState(initialApiKeys);
  const [keyName, setKeyName] = useState("");
  const [newToken, setNewToken] = useState<string | null>(null);
  const [webhookUrl, setWebhookUrl] = useState(initialWebhook?.url ?? "");
  const [webhookEnabled, setWebhookEnabled] = useState(initialWebhook?.enabled ?? false);
  const [newWebhookSecret, setNewWebhookSecret] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function createKey() {
    setMessage(null);
    const response = await fetch("/api/vendor/integrations/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: keyName }),
    });
    const body = await response.json();
    if (!response.ok) return setMessage(body.error?.message ?? "Unable to create API key.");
    setNewToken(body.token);
    setApiKeys((current) => [
      { id: body.id, name: body.name, keyPrefix: body.prefix, createdAt: body.createdAt, lastUsedAt: null, revokedAt: null },
      ...current,
    ]);
    setKeyName("");
  }

  async function revokeKey(id: string) {
    const response = await fetch(`/api/vendor/integrations/api-keys/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!response.ok) return setMessage("Unable to revoke API key.");
    setApiKeys((current) => current.map((key) => key.id === id ? { ...key, revokedAt: new Date().toISOString() } : key));
  }

  async function saveWebhook() {
    setMessage(null);
    const response = await fetch("/api/vendor/integrations/webhook", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: webhookUrl }),
    });
    const body = await response.json();
    if (!response.ok) return setMessage(body.error?.message ?? "Unable to save webhook.");
    setWebhookEnabled(true);
    setNewWebhookSecret(body.signingSecret);
  }

  async function disableWebhook() {
    const response = await fetch("/api/vendor/integrations/webhook", { method: "DELETE" });
    if (!response.ok) return setMessage("Unable to disable webhook.");
    setWebhookEnabled(false);
    setNewWebhookSecret(null);
  }

  async function copy(value: string) {
    await navigator.clipboard.writeText(value);
    setMessage("Copied.");
  }

  return (
    <div className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white">
      <section className="p-5">
        <div className="flex items-start gap-3">
          <KeyRound className="mt-0.5 text-zinc-500" size={18} aria-hidden="true" />
          <div>
            <h2 className="font-medium text-zinc-950">Checkout API keys</h2>
            <p className="mt-1 text-sm text-zinc-500">Use a separate key for each checkout environment.</p>
          </div>
        </div>
        <div className="mt-4 flex max-w-xl gap-2">
          <input
            className="h-9 min-w-0 flex-1 rounded-md border border-zinc-300 px-3 text-sm"
            onChange={(event) => setKeyName(event.target.value)}
            placeholder="Production checkout"
            value={keyName}
          />
          <button className="h-9 rounded-md bg-zinc-900 px-3 text-sm font-medium text-white disabled:opacity-50" disabled={!keyName.trim()} onClick={createKey} type="button">
            Create key
          </button>
        </div>
        {newToken && (
          <div className="mt-4 border-l-2 border-amber-400 bg-amber-50 px-4 py-3">
            <p className="text-sm font-medium text-amber-950">Store this key now. It will not be shown again.</p>
            <div className="mt-2 flex items-center gap-2">
              <code className="min-w-0 flex-1 break-all text-xs text-amber-900">{newToken}</code>
              <button aria-label="Copy API key" className="p-2 text-amber-800" onClick={() => copy(newToken)} title="Copy API key" type="button"><Copy size={16} /></button>
            </div>
          </div>
        )}
        <div className="mt-4 divide-y divide-zinc-100 border-y border-zinc-100">
          {apiKeys.map((key) => (
            <div className="flex items-center justify-between gap-3 py-3" key={key.id}>
              <div>
                <p className="text-sm font-medium text-zinc-900">{key.name}</p>
                <p className="text-xs text-zinc-500">unify_vk_{key.keyPrefix}_... {key.revokedAt ? "· Revoked" : key.lastUsedAt ? "· Used" : "· Never used"}</p>
              </div>
              {!key.revokedAt && <button aria-label={`Revoke ${key.name}`} className="p-2 text-red-600" onClick={() => revokeKey(key.id)} title="Revoke API key" type="button"><Trash2 size={16} /></button>}
            </div>
          ))}
          {apiKeys.length === 0 && <p className="py-4 text-sm text-zinc-500">No API keys created.</p>}
        </div>
      </section>

      <section className="p-5">
        <div className="flex items-start gap-3">
          <Webhook className="mt-0.5 text-zinc-500" size={18} aria-hidden="true" />
          <div>
            <h2 className="font-medium text-zinc-950">Result webhook</h2>
            <p className="mt-1 text-sm text-zinc-500">Receive one signed callback when verification reaches a final result.</p>
          </div>
        </div>
        <div className="mt-4 flex max-w-2xl gap-2">
          <input className="h-9 min-w-0 flex-1 rounded-md border border-zinc-300 px-3 text-sm" onChange={(event) => setWebhookUrl(event.target.value)} placeholder="https://checkout.example.com/webhooks/unify" type="url" value={webhookUrl} />
          <button className="inline-flex h-9 items-center gap-2 rounded-md bg-zinc-900 px-3 text-sm font-medium text-white disabled:opacity-50" disabled={!webhookUrl.trim()} onClick={saveWebhook} type="button">
            {webhookEnabled ? <RotateCw size={15} /> : <Check size={15} />}{webhookEnabled ? "Rotate secret" : "Save"}
          </button>
          {webhookEnabled && <button aria-label="Disable webhook" className="p-2 text-red-600" onClick={disableWebhook} title="Disable webhook" type="button"><Power size={17} /></button>}
        </div>
        {newWebhookSecret && (
          <div className="mt-4 border-l-2 border-amber-400 bg-amber-50 px-4 py-3">
            <p className="text-sm font-medium text-amber-950">Signing secret</p>
            <div className="mt-2 flex items-center gap-2"><code className="min-w-0 flex-1 break-all text-xs text-amber-900">{newWebhookSecret}</code><button aria-label="Copy signing secret" className="p-2 text-amber-800" onClick={() => copy(newWebhookSecret)} title="Copy signing secret" type="button"><Copy size={16} /></button></div>
          </div>
        )}
      </section>
      {message && <p className="px-5 py-3 text-sm text-zinc-600">{message}</p>}
    </div>
  );
}
