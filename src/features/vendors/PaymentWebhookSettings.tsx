"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  IntegrationBadge as Badge,
  IntegrationDetails,
  IntegrationFeedbackMessage,
  IntegrationSecret,
} from "./IntegrationUi";
import { useIntegrationSecret } from "./IntegrationsTabs";
import {
  integrationButton,
  integrationHeading,
  integrationInput,
  integrationPrimaryButton,
  type IntegrationBranch,
  type IntegrationFeedback,
} from "./integrationStyles";

type Config = {
  id: string;
  url: string;
  enabled: boolean;
  branchIds: string[];
};
type Attempt = {
  sequence: number;
  outcome: string;
  httpStatus: number | null;
  errorCode: string | null;
  startedAt: string;
  completedAt: string | null;
};
type Event = {
  id: string;
  eventType: string;
  requestId: string;
  branchId: string;
  createdAt: string;
  delivery: {
    status: string;
    nextAttemptAt: string | null;
    attempts: Attempt[];
  } | null;
};
type History = {
  items: Event[];
  nextCursor: string | null;
  lastSuccess: string | null;
  oldestOutstanding: string | null;
};
const base = "/api/vendor/integrations/payment-webhook";
function date(value: string | null) {
  return value ? new Date(value).toLocaleString() : "None";
}
async function read<T>(response: Response, fallback: string): Promise<T> {
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message ?? fallback);
  return body as T;
}
function errorText(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Unable to update payment callbacks. Try again.";
}
const deliveryLabels: Record<string, string> = {
  READY: "Queued",
  IN_FLIGHT: "Sending",
  DELIVERED: "Delivered",
  PARKED: "Parked",
  EXHAUSTED: "Retries exhausted",
};

export function PaymentWebhookSettings({
  branches,
  guide,
}: {
  branches: IntegrationBranch[];
  guide?: ReactNode;
}) {
  const [url, setUrl] = useState("");
  const [branchIds, setBranchIds] = useState<string[]>([]);
  const [config, setConfig] = useState<Config | null>(null);
  const [secret, revealSecret] = useIntegrationSecret("payments");
  const [history, setHistory] = useState<History>();
  const [feedback, setFeedback] = useState<IntegrationFeedback>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const eligible = branches.filter((branch) => branch.paymentEligible);
  const unavailable = branchIds.filter(
    (id) => !eligible.some((branch) => branch.id === id),
  );

  const refreshHistory = useCallback(async () => {
    const result = await read<History>(
      await fetch(`${base}/history`, { cache: "no-store" }),
      "Unable to load callback history.",
    );
    setHistory(result);
  }, []);
  const loadConfiguration = useCallback(
    async () =>
      read<Config | null>(
        await fetch(base, { cache: "no-store" }),
        "Unable to load payment callback settings.",
      ),
    [],
  );
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      loadConfiguration(),
      fetch(`${base}/history`, { cache: "no-store" }).then((response) =>
        read<History>(response, "Unable to load callback history."),
      ),
    ])
      .then(([configuration, events]) => {
        if (cancelled) return;
        setConfig(configuration);
        setUrl(configuration?.url ?? "");
        setBranchIds(configuration?.branchIds ?? []);
        setHistory(events);
        setLoaded(true);
      })
      .catch((error: unknown) => {
        if (!cancelled) setFeedback({ kind: "error", text: errorText(error) });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadConfiguration]);

  // History refreshes must never reset an owner's unsaved destination or branch selection.
  async function refresh() {
    setPending("refresh");
    setFeedback(null);
    try {
      if (!loaded) {
        const configuration = await loadConfiguration();
        setConfig(configuration);
        setUrl(configuration?.url ?? "");
        setBranchIds(configuration?.branchIds ?? []);
        setLoaded(true);
      }
      await refreshHistory();
    } catch (error) {
      setFeedback({ kind: "error", text: errorText(error) });
    } finally {
      setPending(null);
    }
  }
  async function action(
    path: string,
    method: "PUT" | "DELETE" | "POST",
    body?: unknown,
  ) {
    setPending(
      method === "PUT" ? "save" : method === "DELETE" ? "disable" : path,
    );
    setFeedback(null);
    if (method !== "POST") revealSecret(null);
    try {
      const result = await read<{ configuration?: Config; secret?: string }>(
        await fetch(`${base}${path}`, {
          method,
          headers: { "Content-Type": "application/json" },
          ...(body ? { body: JSON.stringify(body) } : {}),
        }),
        "Unable to update delivery.",
      );
      if (method === "PUT" && result.configuration)
        setConfig(result.configuration);
      if (method === "DELETE")
        setConfig((current) =>
          current ? { ...current, enabled: false } : null,
        );
      if (result.secret) revealSecret(result.secret);
      const text =
        method === "PUT"
          ? "Saved. Copy the new secret now; it is shown only once."
          : method === "DELETE"
            ? "Delivery disabled. Outstanding events are parked."
            : "Retry queued for the current destination.";
      setFeedback({ kind: "success", text });
      try {
        await refreshHistory();
      } catch {
        setFeedback({
          kind: "error",
          text: `${text} Callback history could not be refreshed. Use Refresh to try again.`,
        });
      }
    } catch (error) {
      setFeedback({ kind: "error", text: errorText(error) });
    } finally {
      setPending(null);
    }
  }
  async function nextPage() {
    if (!history?.nextCursor) return;
    setPending("page");
    setFeedback(null);
    try {
      const next = await read<History>(
        await fetch(
          `${base}/history?cursor=${encodeURIComponent(history.nextCursor)}`,
          { cache: "no-store" },
        ),
        "Unable to load older events.",
      );
      setHistory({ ...next, items: [...history.items, ...next.items] });
    } catch (error) {
      setFeedback({ kind: "error", text: errorText(error) });
    } finally {
      setPending(null);
    }
  }
  async function copy() {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      setFeedback({
        kind: "success",
        text: "Secret copied. Store it on your receiving server.",
      });
    } catch {
      setFeedback({
        kind: "error",
        text: "Unable to copy. Select and copy the secret manually.",
      });
    }
  }
  const busy = loading || pending !== null;
  const canSave =
    loaded && url.trim() && branchIds.length > 0 && unavailable.length === 0;
  function save(event: FormEvent) {
    event.preventDefault();
    if (canSave) void action("", "PUT", { url, branchIds });
  }
  const settings = (
    <section
      aria-labelledby="payment-callback-title"
      className="min-w-0 space-y-5 lg:border-l lg:border-border lg:pl-8"
      aria-busy={busy}
    >
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="payment-callback-title" className={integrationHeading}>
          Payment callbacks
        </h2>
        <Badge tone={config?.enabled ? "success" : "neutral"}>
          {loading
            ? "Loading…"
            : !loaded
              ? "Unavailable"
              : config?.enabled
                ? "Enabled"
                : config
                  ? "Disabled"
                  : "Not configured"}
        </Badge>
      </div>
      <p className="text-fg-muted">
        Separate from verification callbacks. Confirm every event against the
        payment request API and continue polling if delivery is unavailable.
      </p>
      <form onSubmit={save} className="space-y-5">
        <fieldset disabled={busy || !loaded} className="min-w-0 space-y-5">
          <div>
            <label htmlFor="payment-webhook-url" className="block font-medium">
              HTTPS destination
            </label>
            <input
              id="payment-webhook-url"
              type="url"
              required
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://your-pos.com/webhooks/unify"
              className={`${integrationInput} mt-2`}
            />
          </div>
          <fieldset className="space-y-3">
            <legend className="font-medium">Payment-enabled branches</legend>
            <div className="space-y-3">
              {eligible.map((branch) => (
                <label key={branch.id} className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    className="size-4 accent-brand-700"
                    checked={branchIds.includes(branch.id)}
                    onChange={(event) =>
                      setBranchIds((current) =>
                        event.target.checked
                          ? [...current, branch.id]
                          : current.filter((id) => id !== branch.id),
                      )
                    }
                  />
                  {branch.name}
                </label>
              ))}
            </div>
            {!eligible.length && (
              <p className="text-fg-muted">
                No eligible payment branches. Enable payment acceptance for an
                active branch before saving callbacks.
              </p>
            )}
            {unavailable.map((id) => (
              <div
                key={id}
                className="flex flex-wrap items-center gap-3 rounded-md bg-surface-muted p-3"
              >
                <label className="flex items-center gap-3">
                  <input type="checkbox" checked disabled className="size-4" />
                  {branches.find((branch) => branch.id === id)?.name ?? id}
                  <span className="text-sm text-fg-muted">Unavailable</span>
                </label>
                <button
                  type="button"
                  className={integrationButton}
                  onClick={() =>
                    setBranchIds((current) =>
                      current.filter((value) => value !== id),
                    )
                  }
                  aria-label={`Remove unavailable branch ${branches.find((branch) => branch.id === id)?.name ?? id}`}
                >
                  Remove
                </button>
              </div>
            ))}
            {unavailable.length > 0 && (
              <p className="text-sm">
                Remove unavailable branches and select an eligible branch before
                saving a replacement.
              </p>
            )}
          </fieldset>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              className={integrationPrimaryButton}
              disabled={busy || !canSave}
            >
              {pending === "save"
                ? "Saving…"
                : config
                  ? "Save replacement and reveal secret"
                  : "Save and reveal secret"}
            </button>
            <button
              type="button"
              className={integrationButton}
              disabled={busy || !config?.enabled}
              onClick={() => void action("", "DELETE")}
            >
              {pending === "disable" ? "Disabling…" : "Disable delivery"}
            </button>
          </div>
        </fieldset>
      </form>
      <p className="text-sm text-fg-muted">
        Replacing configuration parks outstanding events and creates a new
        signing secret. Manual retry sends an old event to the current
        destination.
      </p>
      {secret && (
        <IntegrationSecret
          value={secret}
          label="Payment signing secret"
          payment
          onHide={() => revealSecret(null)}
          onCopy={() => void copy()}
        />
      )}
      <IntegrationFeedbackMessage feedback={feedback} />
      <IntegrationDetails title="Verify payment signatures">
        <p>
          Verify <code>X-Unify-Signature</code> as{" "}
          <code>
            sha256=HMAC_SHA256(secret, timestamp + &quot;.&quot; + rawBody)
          </code>
          . Use the exact <code>X-Unify-Timestamp</code> header and raw JSON
          body.
        </p>
        <p>
          Check timestamp freshness on your receiving server and use{" "}
          <code>X-Unify-Event-Id</code> to handle repeated events safely.
          Confirm the result through the payment request API.
        </p>
      </IntegrationDetails>
    </section>
  );
  return (
    <div className="min-w-0 space-y-8">
      {guide ? (
        <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          {guide}
          {settings}
        </div>
      ) : (
        settings
      )}
      <section
        className="min-w-0 space-y-4 border-t border-border pt-6"
        aria-labelledby="callback-history-title"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="callback-history-title" className={integrationHeading}>
            Callback delivery history
          </h2>
          <button
            type="button"
            className={integrationButton}
            disabled={busy}
            onClick={() => void refresh()}
          >
            {pending === "refresh" ? "Refreshing…" : "Refresh history"}
          </button>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-fg-muted">
          <p>Last success: {date(history?.lastSuccess ?? null)}</p>
          <p>Oldest outstanding: {date(history?.oldestOutstanding ?? null)}</p>
        </div>
        <div className="min-w-0 overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[640px] text-left text-base">
            <caption className="sr-only">
              Payment callback events and delivery attempts
            </caption>
            <thead className="bg-surface-muted text-sm">
              <tr>
                {[
                  "Event / request",
                  "Delivery status",
                  "Attempts",
                  "Next retry",
                  "Action",
                ].map((label) => (
                  <th key={label} scope="col" className="p-3 font-semibold">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {history?.items.map((event) => (
                <tr key={event.id} className="border-t border-border align-top">
                  <td className="max-w-64 p-3">
                    <div className="break-words font-medium">
                      {event.eventType}
                    </div>
                    <Link
                      href={`/vendor/payment-requests/${encodeURIComponent(event.requestId)}`}
                      className="break-all font-medium text-brand-700 underline underline-offset-4"
                    >
                      {event.requestId}
                    </Link>
                    <p className="mt-1 text-sm text-fg-muted">
                      {date(event.createdAt)}
                    </p>
                  </td>
                  <td className="p-3">
                    <Badge
                      tone={
                        event.delivery?.status === "DELIVERED"
                          ? "success"
                          : event.delivery?.status === "EXHAUSTED"
                            ? "danger"
                            : "neutral"
                      }
                    >
                      {event.delivery
                        ? (deliveryLabels[event.delivery.status] ??
                          event.delivery.status)
                        : "No configured delivery"}
                    </Badge>
                  </td>
                  <td className="p-3">
                    <details>
                      <summary className="cursor-pointer">
                        {event.delivery?.attempts.length ?? 0} recent attempts
                      </summary>
                      <div className="mt-2 space-y-2 text-sm">
                        {event.delivery?.attempts.map((attempt) => (
                          <p key={attempt.sequence}>
                            #{attempt.sequence}: {attempt.outcome}
                            {attempt.httpStatus
                              ? ` HTTP ${attempt.httpStatus}`
                              : ""}
                            {attempt.errorCode ? ` (${attempt.errorCode})` : ""}
                            <br />
                            {date(attempt.startedAt)}
                          </p>
                        ))}
                      </div>
                    </details>
                  </td>
                  <td className="p-3 text-sm">
                    {date(event.delivery?.nextAttemptAt ?? null)}
                  </td>
                  <td className="p-3">
                    <button
                      type="button"
                      className={integrationButton}
                      disabled={
                        busy ||
                        !config?.enabled ||
                        !config.branchIds.includes(event.branchId) ||
                        event.delivery?.status === "IN_FLIGHT"
                      }
                      onClick={() =>
                        void action(
                          `/events/${encodeURIComponent(event.id)}/retry`,
                          "POST",
                        )
                      }
                    >
                      {pending === `/events/${event.id}/retry`
                        ? "Queuing…"
                        : "Retry to current destination"}
                    </button>
                  </td>
                </tr>
              ))}
              {!history?.items.length && (
                <tr>
                  <td colSpan={5} className="p-4 text-left text-fg-muted">
                    {loading
                      ? "Loading callback events…"
                      : history
                        ? "No callback events yet."
                        : "Callback history is unavailable. Use Refresh history to retry."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {history?.nextCursor && (
          <button
            type="button"
            className={integrationButton}
            disabled={busy}
            onClick={() => void nextPage()}
          >
            {pending === "page" ? "Loading…" : "Load older events"}
          </button>
        )}
      </section>
    </div>
  );
}
