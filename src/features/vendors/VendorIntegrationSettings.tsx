/**
 * @fileoverview Manages vendor API credentials and webhook delivery settings.
 * @module features/vendors/VendorIntegrationSettings
 */

"use client";

import {
  Check,
  Copy,
  KeyRound,
  Power,
  RotateCw,
  Trash2,
  Webhook,
} from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { IconButton } from "@/components/ui/IconButton";

type ApiKeySummary = {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

const inputClassName =
  "h-9 min-w-0 rounded-md border border-border bg-surface px-3 text-sm text-fg outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";
const primaryButtonClassName =
  "h-9 rounded-md bg-brand-600 px-3 text-sm font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-fg-subtle";

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
  const [webhookEnabled, setWebhookEnabled] = useState(
    initialWebhook?.enabled ?? false,
  );
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
    if (!response.ok) {
      return setMessage(body.error?.message ?? "Unable to create API key.");
    }
    setNewToken(body.token);
    setApiKeys((current) => [
      {
        id: body.id,
        name: body.name,
        keyPrefix: body.prefix,
        createdAt: body.createdAt,
        lastUsedAt: null,
        revokedAt: null,
      },
      ...current,
    ]);
    setKeyName("");
  }

  async function revokeKey(id: string) {
    const response = await fetch(
      `/api/vendor/integrations/api-keys/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
    if (!response.ok) return setMessage("Unable to revoke API key.");
    setApiKeys((current) =>
      current.map((key) =>
        key.id === id ? { ...key, revokedAt: new Date().toISOString() } : key,
      ),
    );
  }

  async function saveWebhook() {
    setMessage(null);
    const response = await fetch("/api/vendor/integrations/webhook", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: webhookUrl }),
    });
    const body = await response.json();
    if (!response.ok) {
      return setMessage(body.error?.message ?? "Unable to save webhook.");
    }
    setWebhookEnabled(true);
    setNewWebhookSecret(body.signingSecret);
  }

  async function disableWebhook() {
    const response = await fetch("/api/vendor/integrations/webhook", {
      method: "DELETE",
    });
    if (!response.ok) return setMessage("Unable to disable webhook.");
    setWebhookEnabled(false);
    setNewWebhookSecret(null);
  }

  async function copy(value: string) {
    await navigator.clipboard.writeText(value);
    setMessage("Copied.");
  }

  return (
    <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface shadow-md">
      <section className="p-5">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-md bg-brand-50 text-brand-700">
            <KeyRound size={18} aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-section-title text-fg">Checkout API keys</h2>
            <p className="mt-1 text-sm text-fg-muted">
              Use a separate key for each checkout environment.
            </p>
          </div>
        </div>

        <div className="mt-4 flex max-w-xl gap-2">
          <input
            className={`${inputClassName} flex-1`}
            onChange={(event) => setKeyName(event.target.value)}
            placeholder="Production checkout"
            value={keyName}
          />
          <button
            className={primaryButtonClassName}
            disabled={!keyName.trim()}
            onClick={createKey}
            type="button"
          >
            Create key
          </button>
        </div>

        {newToken ? (
          <div className="mt-4 rounded-lg border border-warning-border bg-warning-bg px-4 py-3">
            <p className="text-sm font-medium text-warning-fg">
              Store this key now. It will not be shown again.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <code className="min-w-0 flex-1 break-all text-xs text-warning-fg">
                {newToken}
              </code>
              <IconButton
                aria-label="Copy API key"
                onClick={() => copy(newToken)}
                title="Copy API key"
                tone="ghost"
                type="button"
              >
                <Copy size={16} />
              </IconButton>
            </div>
          </div>
        ) : null}

        <div className="mt-4 divide-y divide-border border-y border-border">
          {apiKeys.map((key) => (
            <div
              className="flex items-center justify-between gap-3 py-3"
              key={key.id}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-fg">
                  {key.name}
                </p>
                <p className="text-xs text-fg-subtle">
                  unify_vk_{key.keyPrefix}_...
                  {key.lastUsedAt ? " / Used" : " / Never used"}
                </p>
              </div>
              {key.revokedAt ? (
                <Badge tone="danger">Revoked</Badge>
              ) : (
                <IconButton
                  aria-label={`Revoke ${key.name}`}
                  onClick={() => revokeKey(key.id)}
                  title="Revoke API key"
                  tone="ghost"
                  type="button"
                >
                  <Trash2 className="text-danger-fg" size={16} />
                </IconButton>
              )}
            </div>
          ))}
          {apiKeys.length === 0 ? (
            <p className="py-4 text-sm text-fg-subtle">No API keys created.</p>
          ) : null}
        </div>
      </section>

      <section className="p-5">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-md bg-brand-50 text-brand-700">
            <Webhook size={18} aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-section-title text-fg">Result webhook</h2>
            <p className="mt-1 text-sm text-fg-muted">
              Receive one signed callback when verification reaches a final
              result.
            </p>
          </div>
        </div>

        <div className="mt-4 flex max-w-2xl gap-2">
          <input
            className={`${inputClassName} flex-1`}
            onChange={(event) => setWebhookUrl(event.target.value)}
            placeholder="https://checkout.example.com/webhooks/unify"
            type="url"
            value={webhookUrl}
          />
          <button
            className={`${primaryButtonClassName} inline-flex items-center gap-2`}
            disabled={!webhookUrl.trim()}
            onClick={saveWebhook}
            type="button"
          >
            {webhookEnabled ? <RotateCw size={15} /> : <Check size={15} />}
            {webhookEnabled ? "Rotate secret" : "Save"}
          </button>
          {webhookEnabled ? (
            <IconButton
              aria-label="Disable webhook"
              onClick={disableWebhook}
              title="Disable webhook"
              tone="ghost"
              type="button"
            >
              <Power className="text-danger-fg" size={17} />
            </IconButton>
          ) : null}
        </div>

        {newWebhookSecret ? (
          <div className="mt-4 rounded-lg border border-warning-border bg-warning-bg px-4 py-3">
            <p className="text-sm font-medium text-warning-fg">
              Signing secret
            </p>
            <div className="mt-2 flex items-center gap-2">
              <code className="min-w-0 flex-1 break-all text-xs text-warning-fg">
                {newWebhookSecret}
              </code>
              <IconButton
                aria-label="Copy signing secret"
                onClick={() => copy(newWebhookSecret)}
                title="Copy signing secret"
                tone="ghost"
                type="button"
              >
                <Copy size={16} />
              </IconButton>
            </div>
          </div>
        ) : null}
      </section>

      {message ? (
        <p className="px-5 py-3 text-sm text-fg-muted">{message}</p>
      ) : null}
    </div>
  );
}
