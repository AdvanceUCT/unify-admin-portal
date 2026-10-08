"use client";

// Keep the existing /integrations/keys route and its presets/recovery behavior compatible.
export { VendorIntegrationSettings } from "./integrations/LegacyApiKeySettings";

import { useState, type FormEvent } from "react";
import type { VendorApiScope } from "@/lib/vendors/apiScopes";
import {
  IntegrationBadge as Badge,
  IntegrationDetails,
  IntegrationFeedbackMessage,
  IntegrationNotice,
  IntegrationSecret,
} from "./IntegrationUi";
import { useIntegrationSecret } from "./IntegrationsTabs";
import {
  integrationButton,
  integrationHeading,
  integrationInput,
  integrationPrimaryButton,
  integrationSubheading,
  type IntegrationBranch,
  type IntegrationFeedback,
} from "./integrationStyles";

export type ApiKeySummary = {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  scopes: string[];
  branchIds: string[];
};
const permissions: {
  label: string;
  scopes: { value: VendorApiScope; label: string }[];
}[] = [
  {
    label: "Student verification",
    scopes: [
      { value: "verification:create", label: "Start verification" },
      { value: "verification:read", label: "Read verification results" },
    ],
  },
  {
    label: "POS payments",
    scopes: [
      { value: "payments:create", label: "Create payment requests" },
      { value: "payments:read", label: "Read payments and refunds" },
      { value: "payments:cancel", label: "Cancel payment requests" },
    ],
  },
  {
    label: "Refunds",
    scopes: [{ value: "refunds:create", label: "Refund paid sales" }],
  },
];

async function jsonResponse<T>(response: Response): Promise<T> {
  const body = await response.json();
  if (!response.ok)
    throw new Error(
      body.error?.message ?? "Unable to update integration settings.",
    );
  return body as T;
}
function failure(error: unknown): IntegrationFeedback {
  return {
    kind: "error",
    text:
      error instanceof Error
        ? error.message
        : "Unable to update integration settings. Try again.",
  };
}
async function copySecret(
  value: string,
  report: (feedback: IntegrationFeedback) => void,
) {
  try {
    await navigator.clipboard.writeText(value);
    report({
      kind: "success",
      text: "Secret copied. Store it on your server.",
    });
  } catch {
    report({
      kind: "error",
      text: "Unable to copy. Select and copy the secret manually.",
    });
  }
}

export function VendorApiKeySettings({
  initialApiKeys,
  branches,
}: {
  initialApiKeys: ApiKeySummary[];
  branches: IntegrationBranch[];
}) {
  const [apiKeys, setApiKeys] = useState(initialApiKeys);
  const [scopes, setScopes] = useState<VendorApiScope[]>([
    "verification:create",
    "verification:read",
  ]);
  const [branchIds, setBranchIds] = useState<string[]>([]);
  const [keyName, setKeyName] = useState("");
  const [newToken, revealToken] = useIntegrationSecret("keys");
  const [feedback, setFeedback] = useState<IntegrationFeedback>(null);
  const [pending, setPending] = useState<string | null>(null);
  const needsBranch = scopes.some(
    (scope) => scope.startsWith("payments:") || scope.startsWith("refunds:"),
  );

  const defaultBranch = branches.find((branch) => branch.isDefault);
  const missingDefault =
    scopes.includes("verification:create") &&
    branchIds.length > 0 &&
    !branchIds.includes(defaultBranch?.id ?? "");

  async function createKey(event: FormEvent) {
    event.preventDefault();
    setPending("create");
    setFeedback(null);
    revealToken(null);
    try {
      const body = await jsonResponse<{
        id: string;
        name: string;
        prefix: string;
        token: string;
        createdAt: string;
        scopes: string[];
        branchIds: string[];
      }>(
        await fetch("/api/vendor/integrations/api-keys", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: keyName, scopes, branchIds }),
        }),
      );
      revealToken(body.token);
      setApiKeys((current) => [
        {
          id: body.id,
          name: body.name,
          keyPrefix: body.prefix,
          createdAt: body.createdAt,
          lastUsedAt: null,
          revokedAt: null,
          scopes: body.scopes,
          branchIds: body.branchIds,
        },
        ...current,
      ]);
      setKeyName("");
      setFeedback({
        kind: "success",
        text: "API key created. Copy it now; it is shown only once.",
      });
    } catch (error) {
      setFeedback(failure(error));
    } finally {
      setPending(null);
    }
  }
  async function revokeKey(id: string) {
    setPending(id);
    setFeedback(null);
    try {
      const response = await fetch(
        `/api/vendor/integrations/api-keys/${encodeURIComponent(id)}`,
        { method: "DELETE" },
      );
      if (!response.ok) throw new Error("Unable to revoke API key. Try again.");
      setApiKeys((current) =>
        current.map((key) =>
          key.id === id ? { ...key, revokedAt: new Date().toISOString() } : key,
        ),
      );
      setFeedback({ kind: "success", text: "API key revoked." });
      revealToken(null);
    } catch (error) {
      setFeedback(failure(error));
    } finally {
      setPending(null);
    }
  }
  return (
    <div className="space-y-8">
      <div>
        <h2 className={integrationHeading}>Checkout API keys</h2>
        <p className="mt-2 text-fg-muted">
          Use a separate key for each checkout environment. Store keys only on
          your server.
        </p>
      </div>
      <form
        onSubmit={createKey}
        className="space-y-6"
        aria-busy={pending !== null}
      >
        <fieldset disabled={pending !== null} className="min-w-0 space-y-6">
          <div className="max-w-xl">
            <label htmlFor="integration-key-name" className="block font-medium">
              Key name
            </label>
            <input
              id="integration-key-name"
              required
              className={`${integrationInput} mt-2`}
              value={keyName}
              onChange={(event) => setKeyName(event.target.value)}
              placeholder="Production checkout"
            />
          </div>
          <fieldset className="space-y-3">
            <legend className={integrationSubheading}>Key permissions</legend>
            <div className="grid gap-6 md:grid-cols-3">
              {permissions.map((group) => (
                <div key={group.label} className="space-y-3">
                  <h3 className="font-semibold">{group.label}</h3>
                  {group.scopes.map((scope) => (
                    <label key={scope.value} className="flex items-start gap-3">
                      <input
                        className="mt-1.5 size-4 shrink-0 accent-brand-700"
                        type="checkbox"
                        checked={scopes.includes(scope.value)}
                        onChange={(event) =>
                          setScopes((current) =>
                            event.target.checked
                              ? [...current, scope.value]
                              : current.filter(
                                  (value) => value !== scope.value,
                                ),
                          )
                        }
                      />
                      <span>
                        {scope.label}
                        <code className="block break-all font-mono text-sm text-fg-muted">
                          {scope.value}
                        </code>
                      </span>
                    </label>
                  ))}
                </div>
              ))}
            </div>
            <p className="text-sm text-fg-muted">
              Refund permission lets your POS refund its own paid sales.
            </p>
          </fieldset>
          <fieldset className="space-y-3">
            <legend className={integrationSubheading}>
              Permitted branches
            </legend>
            <div className="flex flex-wrap gap-x-6 gap-y-3">
              {branches.map((branch) => (
                <label key={branch.id} className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    className="size-4 accent-brand-700"
                    checked={branchIds.includes(branch.id)}
                    onChange={(event) =>
                      setBranchIds((current) =>
                        event.target.checked
                          ? [...current, branch.id]
                          : current.filter((value) => value !== branch.id),
                      )
                    }
                  />
                  {branch.name}
                </label>
              ))}
            </div>
            {!branches.length && (
              <p className="text-fg-muted">
                No branches available. Add a branch before creating payment or
                refund keys.
              </p>
            )}
            <p id="key-branch-help" className="text-sm text-fg-muted">
              Payment and refund keys need at least one branch. Replace a key to
              change its permissions.
            </p>
            {missingDefault && (
              <p role="status" className="text-sm">
                Include the default branch to start checkout verification.
              </p>
            )}
            {needsBranch && !branchIds.length && (
              <p className="text-sm text-fg">
                Select a branch to enable key creation.
              </p>
            )}
          </fieldset>
          <button
            type="submit"
            className={integrationPrimaryButton}
            disabled={
              pending !== null ||
              !keyName.trim() ||
              !scopes.length ||
              missingDefault ||
              (needsBranch && !branchIds.length)
            }
          >
            {pending === "create" ? "Creating key…" : "Create key"}
          </button>
        </fieldset>
      </form>
      {newToken && (
        <IntegrationSecret
          value={newToken}
          label="Your new API key"
          onHide={() => revealToken(null)}
          onCopy={() => void copySecret(newToken, setFeedback)}
        />
      )}
      <IntegrationFeedbackMessage feedback={feedback} />
      <section className="space-y-4 border-t border-border pt-6">
        <h2 className={integrationHeading}>Your API keys</h2>
        {!apiKeys.length ? (
          <p className="rounded-md bg-surface-muted p-4 text-fg-muted">
            No API keys created.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {apiKeys.map((key) => (
              <li
                key={key.id}
                className="flex flex-wrap items-start justify-between gap-4 py-5"
              >
                <div className="min-w-0 flex-1 basis-64 space-y-2">
                  <h3 className={`${integrationSubheading} break-words`}>
                    {key.name}
                  </h3>
                  <code className="block break-all font-mono text-sm text-fg-muted">
                    unify_vk_{key.keyPrefix}_...
                  </code>
                  <p className="break-words text-sm">
                    <span className="font-medium">Permissions:</span>{" "}
                    {key.scopes.join(", ")}
                  </p>
                  <p className="break-words text-sm">
                    <span className="font-medium">Branches:</span>{" "}
                    {key.branchIds
                      .map(
                        (id) =>
                          branches.find((branch) => branch.id === id)?.name ??
                          id,
                      )
                      .join(", ") || "Verification only"}
                  </p>
                  <p className="text-sm text-fg-muted">
                    Created {new Date(key.createdAt).toLocaleString()} ·{" "}
                    {key.lastUsedAt
                      ? `Last used ${new Date(key.lastUsedAt).toLocaleString()}`
                      : "Never used"}
                  </p>
                </div>
                {key.revokedAt ? (
                  <Badge tone="danger">Revoked</Badge>
                ) : (
                  <button
                    type="button"
                    className={integrationButton}
                    disabled={pending !== null}
                    aria-label={`Revoke ${key.name}`}
                    onClick={() => void revokeKey(key.id)}
                  >
                    {pending === key.id ? "Revoking…" : "Revoke key"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      <IntegrationNotice title="Keep keys on your server">
        <p>
          Never include a <code>unify_vk_...</code> key in browser JavaScript or
          a mobile app. Grant only the permissions each integration needs.
        </p>
      </IntegrationNotice>
    </div>
  );
}

export function VerificationWebhookSettings({
  initialWebhook,
}: {
  initialWebhook: { url: string; enabled: boolean } | null;
}) {
  const [url, setUrl] = useState(initialWebhook?.url ?? "");
  const [config, setConfig] = useState(initialWebhook);
  const [secret, revealSecret] = useIntegrationSecret("website");
  const [feedback, setFeedback] = useState<IntegrationFeedback>(null);
  const [pending, setPending] = useState<"save" | "disable" | null>(null);
  async function save(event: FormEvent) {
    event.preventDefault();
    setPending("save");
    setFeedback(null);
    revealSecret(null);
    try {
      const body = await jsonResponse<{ url: string; signingSecret: string }>(
        await fetch("/api/vendor/integrations/webhook", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        }),
      );
      setConfig({ url: body.url, enabled: true });
      revealSecret(body.signingSecret);
      setFeedback({
        kind: "success",
        text: "Webhook saved. Copy the new signing secret now.",
      });
    } catch (error) {
      setFeedback(failure(error));
    } finally {
      setPending(null);
    }
  }
  async function disable() {
    setPending("disable");
    setFeedback(null);
    try {
      await jsonResponse(
        await fetch("/api/vendor/integrations/webhook", { method: "DELETE" }),
      );
      setConfig((current) => (current ? { ...current, enabled: false } : null));
      revealSecret(null);
      setFeedback({ kind: "success", text: "Verification webhook disabled." });
    } catch (error) {
      setFeedback(failure(error));
    } finally {
      setPending(null);
    }
  }
  return (
    <section
      aria-labelledby="verification-webhook-title"
      className="min-w-0 space-y-5 lg:border-l lg:border-border lg:pl-8"
    >
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="verification-webhook-title" className={integrationHeading}>
          Verification webhook
        </h2>
        <Badge tone={config?.enabled ? "success" : "neutral"}>
          {config?.enabled ? "Enabled" : config ? "Disabled" : "Not configured"}
        </Badge>
      </div>
      <p className="text-fg-muted">
        Receive a signed callback when a verification reaches its final result.
      </p>
      <form onSubmit={save} className="space-y-4" aria-busy={pending !== null}>
        <label htmlFor="verification-webhook-url" className="block font-medium">
          HTTPS destination
        </label>
        <input
          id="verification-webhook-url"
          className={integrationInput}
          type="url"
          required
          disabled={pending !== null}
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://your-site.com/webhooks/unify"
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            className={integrationPrimaryButton}
            disabled={pending !== null || !url.trim()}
          >
            {pending === "save"
              ? "Saving…"
              : config?.enabled
                ? "Save and rotate secret"
                : "Save webhook"}
          </button>
          {config?.enabled && (
            <button
              type="button"
              className={integrationButton}
              disabled={pending !== null}
              onClick={() => void disable()}
            >
              {pending === "disable" ? "Disabling…" : "Disable webhook"}
            </button>
          )}
        </div>
      </form>
      {config?.enabled && (
        <p className="text-sm text-fg-muted">
          Saving replaces the destination and rotates the signing secret. Update
          your receiving server with the new secret.
        </p>
      )}
      {secret && (
        <IntegrationSecret
          value={secret}
          label="Verification signing secret"
          onHide={() => revealSecret(null)}
          onCopy={() => void copySecret(secret, setFeedback)}
        />
      )}
      <IntegrationFeedbackMessage feedback={feedback} />
      <IntegrationNotice title="Keep keys on your server">
        <p>
          Never include API keys in browser code. Keep checkout pending until
          your server confirms approval.
        </p>
      </IntegrationNotice>
      <IntegrationDetails title="Verify callback signatures">
        <p>
          Verify <code>X-Unify-Signature</code> as{" "}
          <code>sha256=HMAC_SHA256(secret, rawBody)</code> against the exact raw
          JSON body. Verification signatures do not include the payment
          timestamp prefix.
        </p>
        <p>
          Use <code>X-Unify-Event-Id</code> and your <code>checkoutId</code> to
          process repeated callbacks safely. Poll the verification API when
          delivery is unavailable.
        </p>
      </IntegrationDetails>
      <p className="text-sm text-fg-muted">
        Use a stable checkoutId from your order system. Retrying it resumes the
        same verification.
      </p>
    </section>
  );
}
