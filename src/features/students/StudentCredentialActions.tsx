/**
 * @fileoverview Offers the lifecycle actions valid for a student's current credential.
 * @module features/students/StudentCredentialActions
 */

"use client";

import { Ban, Copy, ExternalLink, LoaderCircle, PauseCircle, RotateCcw, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Dialog } from "@/components/ui/Dialog";
import type { ActivationDelivery, BatchIssuanceResult, StudentRecord } from "@/lib/api/types";
import { formatActivationDeliveryStatus, formatDateTime } from "@/lib/formatters";

type StudentCredentialActionsProps = {
  delivery?: ActivationDelivery;
  student: StudentRecord;
};

type LifecycleAction = "reactivate" | "revoke" | "suspend";

const lifecycleCopy: Record<LifecycleAction, { confirmClassName: string; description: string; title: string }> = {
  reactivate: {
    confirmClassName: "bg-success-fg hover:opacity-90",
    description: "Verification will succeed again after the updated status list reaches the ledger.",
    title: "Reactivate credential",
  },
  revoke: {
    confirmClassName: "bg-danger-fg hover:opacity-90",
    description: "Revocation is permanent. The student will need a newly issued credential.",
    title: "Revoke credential",
  },
  suspend: {
    confirmClassName: "bg-warning-fg hover:opacity-90",
    description: "Verification will fail until the scheduled time or an administrator reactivates this credential.",
    title: "Suspend credential",
  },
};

const lifecycleButtonToneClassName: Record<LifecycleAction, string> = {
  reactivate: "border-success-border bg-success-bg text-success-fg hover:bg-success-border",
  revoke: "border-danger-border bg-danger-bg text-danger-fg hover:bg-danger-border",
  suspend: "border-warning-border bg-warning-bg text-warning-fg hover:bg-warning-border",
};

async function readErrorMessage(response: Response) {
  const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
  return body?.error?.message ?? `Credential request failed with status ${response.status}.`;
}

export function StudentCredentialActions({ delivery, student }: StudentCredentialActionsProps) {
  const router = useRouter();
  const [currentDelivery, setCurrentDelivery] = useState<ActivationDelivery | undefined>(delivery);
  const [copyLabel, setCopyLabel] = useState("Copy");
  const [error, setError] = useState<string | null>(null);
  const [isIssuing, setIsIssuing] = useState(false);
  const [isRenewing, setIsRenewing] = useState(false);
  const [isChangingLifecycle, setIsChangingLifecycle] = useState(false);
  const [lifecycleAction, setLifecycleAction] = useState<LifecycleAction | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [reactivateAutomatically, setReactivateAutomatically] = useState(false);
  const [reactivationTime, setReactivationTime] = useState("");

  const canIssue = useMemo(() => {
    const stateAllowsIssue = ["NOT_ISSUED", "FAILED", "REVOKED"].includes(student.credential.lifecycleState);
    return stateAllowsIssue && (student.credential.lifecycleState === "REVOKED" || currentDelivery?.status !== "Delivered");
  }, [currentDelivery?.status, student.credential.lifecycleState]);
  const canSuspend = student.credential.lifecycleState === "ACTIVE";
  const canReactivate = student.credential.lifecycleState === "SUSPENDED";
  const canRenew = ["ACTIVE", "EXPIRED"].includes(student.credential.lifecycleState);
  const canRevoke =
    canSuspend ||
    canReactivate ||
    (Boolean(student.credential.isRevocable) &&
      ["ACCEPTED", "OFFER_SENT"].includes(student.credential.lifecycleState));
  const lifecycleUnavailableReason = useMemo(() => {
    switch (student.credential.lifecycleState) {
      case "ACCEPTED":
      case "OFFER_SENT":
        if (student.credential.isRevocable) {
          return null;
        }
        return "The student has not stored this credential yet. Revocation becomes available once the credential is active.";
      case "EXPIRED":
        return "This credential has already expired.";
      case "FAILED":
      case "NOT_ISSUED":
        return "No issued credential exists for this student yet.";
      case "LEGACY_NON_REVOCABLE":
        return "This credential was issued before revocation support was enabled. Reissue it under a revocation-enabled schema first.";
      case "REVOKED":
        return "This credential has already been permanently revoked.";
      default:
        return null;
    }
  }, [student.credential.isRevocable, student.credential.lifecycleState]);

  async function issueCredential() {
    setCopyLabel("Copy");
    setError(null);
    setIsIssuing(true);
    setMessage(null);

    try {
      const response = await fetch(`/api/students/${encodeURIComponent(student.profile.id)}/credentials/issue`, {
        cache: "no-store",
        method: "POST",
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const result = (await response.json()) as BatchIssuanceResult;
      const nextDelivery = result.activationDeliveries[0];
      const failureReason = nextDelivery?.failureReason ?? result.failures?.[0]?.message;
      setCurrentDelivery(nextDelivery);
      setMessage(
        nextDelivery?.status === "Delivered"
          ? `Activation link delivered to ${nextDelivery.email ?? student.profile.email}.`
          : `Activation link was created, but email delivery failed${failureReason ? `: ${failureReason}` : "."}`,
      );
      router.refresh();
    } catch (issueError) {
      setError(issueError instanceof Error ? issueError.message : "Credential issue request failed.");
    } finally {
      setIsIssuing(false);
    }
  }

  async function renewCredential() {
    setCopyLabel("Copy");
    setError(null);
    setIsRenewing(true);
    setMessage(null);

    try {
      const response = await fetch(`/api/students/${encodeURIComponent(student.profile.id)}/credentials/renew`, {
        cache: "no-store",
        method: "POST",
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const result = (await response.json()) as BatchIssuanceResult;
      const nextDelivery = result.activationDeliveries[0];
      const failureReason = nextDelivery?.failureReason ?? result.failures?.[0]?.message;
      setCurrentDelivery(nextDelivery);
      setMessage(
        nextDelivery?.status === "Delivered"
          ? `Renewal activation link delivered to ${nextDelivery.email ?? student.profile.email}.`
          : `Renewal link was created, but email delivery failed${failureReason ? `: ${failureReason}` : "."}`,
      );
      router.refresh();
    } catch (renewalError) {
      setError(renewalError instanceof Error ? renewalError.message : "Credential renewal request failed.");
    } finally {
      setIsRenewing(false);
    }
  }

  async function copyActivationLink() {
    if (!currentDelivery?.activationUrl) {
      return;
    }

    try {
      await navigator.clipboard.writeText(currentDelivery.activationUrl);
      setCopyLabel("Copied");
    } catch {
      setCopyLabel("Select link");
    }
  }

  function selectLifecycleAction(action: LifecycleAction) {
    setError(null);
    setMessage(null);
    setReason("");
    setReactivateAutomatically(false);
    setReactivationTime("");
    setLifecycleAction(action);
  }

  function closeLifecycleDialog() {
    setLifecycleAction(null);
  }

  async function submitLifecycleChange() {
    if (!lifecycleAction || !reason.trim()) return;
    setError(null);
    setIsChangingLifecycle(true);
    setMessage(null);

    try {
      const response = await fetch(
        `/api/students/${encodeURIComponent(student.profile.id)}/credentials/lifecycle`,
        {
          body: JSON.stringify({
            action: lifecycleAction,
            reason: reason.trim(),
            ...(lifecycleAction === "suspend" && reactivateAutomatically
              ? { reactivateAt: new Date(reactivationTime).toISOString() }
              : {}),
          }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        },
      );
      if (!response.ok) throw new Error(await readErrorMessage(response));

      const label = lifecycleAction === "reactivate" ? "reactivated" : lifecycleAction === "suspend" ? "suspended" : "revoked";
      setMessage(`Credential ${label}.`);
      setLifecycleAction(null);
      setReason("");
      router.refresh();
    } catch (lifecycleError) {
      setError(lifecycleError instanceof Error ? lifecycleError.message : "Credential lifecycle request failed.");
    } finally {
      setIsChangingLifecycle(false);
    }
  }

  async function retryAutomation() {
    if (!student.credential.automation) return;
    setError(null);
    setIsChangingLifecycle(true);
    try {
      const response = await fetch(`/api/credentials/automation/${encodeURIComponent(student.credential.automation.id)}/retry`, { method: "POST" });
      if (!response.ok) throw new Error(await readErrorMessage(response));
      setMessage("Credential automation retry completed.");
      router.refresh();
    } catch (retryError) {
      setError(retryError instanceof Error ? retryError.message : "Credential automation retry failed.");
    } finally {
      setIsChangingLifecycle(false);
    }
  }

  return (
    <>
      <section className="rounded-xl border border-border bg-surface p-5 shadow-md">
        <h2 className="text-section-title text-fg">Available actions</h2>

        {message ? (
          <p className="mt-4 rounded-md border border-success-border bg-success-bg px-3 py-2 text-sm text-success-fg">
            {message}
          </p>
        ) : null}
        {error ? (
          <p className="mt-4 rounded-md border border-danger-border bg-danger-bg px-3 py-2 text-sm text-danger-fg">
            {error}
          </p>
        ) : null}

        {student.credential.scheduledReactivationAt ? (
          <p className="mt-4 rounded-md border border-warning-border bg-warning-bg px-3 py-2 text-sm text-warning-fg">
            Scheduled to reactivate after {formatDateTime(student.credential.scheduledReactivationAt)}.
          </p>
        ) : student.credential.lifecycleState === "SUSPENDED" ? (
          <p className="mt-4 text-sm text-fg-subtle">Suspended indefinitely.</p>
        ) : null}
        {student.credential.nextRenewalAt ? (
          <p className="mt-3 text-sm text-fg-subtle">Next automatic renewal: {formatDateTime(student.credential.nextRenewalAt)}</p>
        ) : null}
        {student.credential.automation?.status === "FAILED" ? (
          <div className="mt-4 rounded-md border border-danger-border bg-danger-bg px-3 py-2 text-sm text-danger-fg">
            <p>{student.credential.automation.lastError ?? "Credential automation failed."}</p>
            <button className="mt-2 rounded-md border border-danger-border px-3 py-1.5 font-medium disabled:opacity-50" disabled={isChangingLifecycle} onClick={retryAutomation} type="button">Retry now</button>
          </div>
        ) : null}

        {canIssue || canRenew ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {canIssue ? (
              <button
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-brand-600 px-3 text-sm font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-fg-subtle"
                disabled={isIssuing}
                onClick={issueCredential}
                type="button"
              >
                {isIssuing ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : <Send aria-hidden className="size-4" />}
                {isIssuing ? "Issuing..." : "Issue credential"}
              </button>
            ) : null}
            {canRenew ? (
              <button
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-surface px-3 text-sm font-medium text-fg-muted transition hover:border-border-strong hover:bg-surface-muted hover:text-fg disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isRenewing}
                onClick={renewCredential}
                type="button"
              >
                {isRenewing ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : <RotateCcw aria-hidden className="size-4" />}
                {isRenewing ? "Renewing..." : "Renew credential"}
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="mt-5 border-t border-border pt-4">
          <h3 className="text-sm font-medium text-fg">Lifecycle controls</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {canSuspend ? (
              <button
                className={`inline-flex h-10 items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium transition disabled:opacity-50 ${lifecycleButtonToneClassName.suspend}`}
                disabled={isChangingLifecycle}
                onClick={() => selectLifecycleAction("suspend")}
                type="button"
              >
                <PauseCircle aria-hidden className="size-4" />
                Suspend
              </button>
            ) : null}
            {canReactivate ? (
              <button
                className={`inline-flex h-10 items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium transition disabled:opacity-50 ${lifecycleButtonToneClassName.reactivate}`}
                disabled={isChangingLifecycle}
                onClick={() => selectLifecycleAction("reactivate")}
                type="button"
              >
                <RotateCcw aria-hidden className="size-4" />
                Reactivate
              </button>
            ) : null}
            <button
              className={`inline-flex h-10 items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:border-border disabled:bg-surface-muted disabled:text-fg-subtle disabled:hover:bg-surface-muted ${lifecycleButtonToneClassName.revoke}`}
              disabled={isChangingLifecycle || !canRevoke}
              onClick={() => selectLifecycleAction("revoke")}
              type="button"
            >
              <Ban aria-hidden className="size-4" />
              Revoke
            </button>
          </div>
          {!canSuspend && !canReactivate && lifecycleUnavailableReason ? (
            <p className="mt-3 rounded-md border border-warning-border bg-warning-bg px-3 py-2 text-sm text-warning-fg">
              {lifecycleUnavailableReason}
            </p>
          ) : null}
        </div>
      </section>

      {currentDelivery ? (
        <section className="rounded-xl border border-border bg-surface p-5 shadow-md">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-section-title text-fg">Activation delivery</h2>
            <Badge tone={currentDelivery.status === "Failed" ? "danger" : "success"}>
              {formatActivationDeliveryStatus(currentDelivery.status)}
            </Badge>
          </div>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-fg-subtle">Email</dt>
              <dd className="text-right text-fg">{currentDelivery.email ?? student.profile.email}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-fg-subtle">Expires</dt>
              <dd className="text-right text-fg">{formatDateTime(currentDelivery.expiresAt)}</dd>
            </div>
            {currentDelivery.failureReason ? (
              <div className="flex justify-between gap-4">
                <dt className="text-fg-subtle">Failure</dt>
                <dd className="max-w-xs text-right text-danger-fg">{currentDelivery.failureReason}</dd>
              </div>
            ) : null}
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            <input
              className="min-w-0 flex-1 rounded-md border border-border bg-surface px-3 py-2 font-mono text-xs text-fg-muted"
              readOnly
              value={currentDelivery.activationUrl}
            />
            <a
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border px-3 text-sm font-medium text-fg-muted transition hover:border-border-strong hover:bg-surface-muted hover:text-fg"
              href={currentDelivery.activationUrl}
              rel="noreferrer"
              target="_blank"
            >
              <ExternalLink aria-hidden className="size-4" />
              Open
            </a>
            <button
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border px-3 text-sm font-medium text-fg-muted transition hover:border-border-strong hover:bg-surface-muted hover:text-fg"
              onClick={copyActivationLink}
              type="button"
            >
              <Copy aria-hidden className="size-4" />
              {copyLabel}
            </button>
          </div>
        </section>
      ) : null}

      <Dialog
        isOpen={lifecycleAction !== null}
        onClose={closeLifecycleDialog}
        title={lifecycleAction ? lifecycleCopy[lifecycleAction].title : ""}
      >
        {lifecycleAction ? (
          <div className="space-y-3">
            <p className="text-sm text-fg-muted">{lifecycleCopy[lifecycleAction].description}</p>
            <div>
              <label className="block text-sm font-medium text-fg" htmlFor="lifecycle-reason">
                Reason
              </label>
              <textarea
                className="mt-1.5 min-h-24 w-full resize-y rounded-md border border-border px-3 py-2 text-sm text-fg outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                disabled={isChangingLifecycle}
                id="lifecycle-reason"
                maxLength={500}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Enter the reason for this change"
                value={reason}
              />
            </div>
            {lifecycleAction === "suspend" ? (
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium text-fg">
                  <input checked={reactivateAutomatically} disabled={isChangingLifecycle} onChange={(event) => setReactivateAutomatically(event.target.checked)} type="checkbox" />
                  Reactivate automatically
                </label>
                {reactivateAutomatically ? (
                  <label className="block text-sm font-medium text-fg" htmlFor="reactivation-time">
                    Suspension ends
                    <input className="mt-1.5 h-10 w-full rounded-md border border-border px-3 text-sm" disabled={isChangingLifecycle} id="reactivation-time" onChange={(event) => setReactivationTime(event.target.value)} required type="datetime-local" value={reactivationTime} />
                  </label>
                ) : <p className="text-sm text-fg-subtle">No end time: an administrator must reactivate it manually.</p>}
              </div>
            ) : null}
            <div className="flex flex-wrap justify-end gap-2">
              <button
                className="inline-flex h-9 items-center justify-center rounded-md border border-border px-3 text-sm font-medium text-fg-muted transition hover:border-border-strong hover:bg-surface-muted hover:text-fg disabled:opacity-50"
                disabled={isChangingLifecycle}
                onClick={closeLifecycleDialog}
                type="button"
              >
                Cancel
              </button>
              <button
                className={`inline-flex h-9 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-50 ${lifecycleCopy[lifecycleAction].confirmClassName}`}
                disabled={isChangingLifecycle || !reason.trim() || (lifecycleAction === "suspend" && reactivateAutomatically && !reactivationTime)}
                onClick={submitLifecycleChange}
                type="button"
              >
                {isChangingLifecycle ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : null}
                Confirm
              </button>
            </div>
          </div>
        ) : null}
      </Dialog>
    </>
  );
}
