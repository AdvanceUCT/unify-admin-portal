"use client";

import { Ban, Copy, ExternalLink, LoaderCircle, PauseCircle, RotateCcw, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import type { ActivationDelivery, BatchIssuanceResult, StudentRecord } from "@/lib/api/types";
import { formatActivationDeliveryStatus, formatDateTime } from "@/lib/formatters";

type StudentCredentialActionsProps = {
  delivery?: ActivationDelivery;
  student: StudentRecord;
};

type LifecycleAction = "reactivate" | "revoke" | "suspend";

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
  const [isChangingLifecycle, setIsChangingLifecycle] = useState(false);
  const [lifecycleAction, setLifecycleAction] = useState<LifecycleAction | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const canIssue = useMemo(() => {
    const stateAllowsIssue = ["NOT_ISSUED", "FAILED", "REVOKED"].includes(student.credential.lifecycleState);
    return stateAllowsIssue && (student.credential.lifecycleState === "REVOKED" || currentDelivery?.status !== "Delivered");
  }, [currentDelivery?.status, student.credential.lifecycleState]);
  const canSuspend = student.credential.lifecycleState === "ACTIVE";
  const canReactivate = student.credential.lifecycleState === "SUSPENDED";
  const canRevoke = canSuspend || canReactivate;
  const lifecycleUnavailableReason = useMemo(() => {
    switch (student.credential.lifecycleState) {
      case "ACCEPTED":
      case "OFFER_SENT":
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
  }, [student.credential.lifecycleState]);

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
    setLifecycleAction(action);
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
          body: JSON.stringify({ action: lifecycleAction, reason: reason.trim() }),
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

  return (
    <div className="space-y-5">
      <div>
        <h2 className="mb-4 text-base font-semibold text-zinc-950">Available actions</h2>
        {canIssue ? (
          <div>
            <button
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-zinc-950 bg-zinc-950 px-3 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-200 disabled:text-zinc-500"
              disabled={isIssuing}
              onClick={issueCredential}
              type="button"
            >
              {isIssuing ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : <Send aria-hidden className="size-4" />}
              {isIssuing ? "Issuing..." : "Issue credential"}
            </button>
          </div>
        ) : null}

        <div className="mt-4 space-y-2">
          <h3 className="text-sm font-medium text-zinc-950">Lifecycle controls</h3>
          <div className="flex flex-wrap gap-2">
            {canSuspend ? (
              <button
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-amber-300 bg-white px-3 text-sm font-medium text-amber-800 transition hover:bg-amber-50 disabled:opacity-50"
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
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-emerald-300 bg-white px-3 text-sm font-medium text-emerald-800 transition hover:bg-emerald-50 disabled:opacity-50"
                disabled={isChangingLifecycle}
                onClick={() => selectLifecycleAction("reactivate")}
                type="button"
              >
                <RotateCcw aria-hidden className="size-4" />
                Reactivate
              </button>
            ) : null}
            <button
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-rose-300 bg-white px-3 text-sm font-medium text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:border-zinc-200 disabled:bg-zinc-50 disabled:text-zinc-400"
              disabled={isChangingLifecycle || !canRevoke}
              onClick={() => selectLifecycleAction("revoke")}
              type="button"
            >
              <Ban aria-hidden className="size-4" />
              Revoke
            </button>
          </div>
          {!canSuspend && !canReactivate && lifecycleUnavailableReason ? (
            <p className="text-xs leading-5 text-zinc-600">{lifecycleUnavailableReason}</p>
          ) : null}
        </div>

        {lifecycleAction ? (
          <div className="mt-4 space-y-3 border-t border-zinc-200 pt-4">
            <div>
              <h3 className="text-sm font-medium text-zinc-950">
                {lifecycleAction === "reactivate" ? "Reactivate credential" : lifecycleAction === "suspend" ? "Suspend credential" : "Revoke credential"}
              </h3>
              <p className="mt-1 text-xs leading-5 text-zinc-600">
                {lifecycleAction === "revoke"
                  ? "Revocation is permanent. The student will need a newly issued credential."
                  : lifecycleAction === "suspend"
                    ? "Verification will fail until an administrator reactivates this credential."
                    : "Verification will succeed again after the updated status list reaches the ledger."}
              </p>
            </div>
            <label className="block text-sm font-medium text-zinc-800" htmlFor="lifecycle-reason">
              Reason
            </label>
            <textarea
              className="min-h-24 w-full resize-y rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-950 focus:ring-2 focus:ring-zinc-200"
              disabled={isChangingLifecycle}
              id="lifecycle-reason"
              maxLength={500}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Enter the reason for this change"
              value={reason}
            />
            <div className="flex flex-wrap gap-2">
              <button
                className={`inline-flex h-9 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-50 ${lifecycleAction === "revoke" ? "bg-rose-700 hover:bg-rose-800" : "bg-zinc-950 hover:bg-zinc-800"}`}
                disabled={isChangingLifecycle || !reason.trim()}
                onClick={submitLifecycleChange}
                type="button"
              >
                {isChangingLifecycle ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : null}
                Confirm
              </button>
              <button
                className="inline-flex h-9 items-center justify-center rounded-md border border-zinc-300 px-3 text-sm font-medium text-zinc-700 transition hover:border-zinc-500 disabled:opacity-50"
                disabled={isChangingLifecycle}
                onClick={() => setLifecycleAction(null)}
                type="button"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {message ? <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</p> : null}
      {error ? <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}

      {currentDelivery ? (
        <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-medium text-zinc-950">Activation delivery</h3>
            <Badge tone={currentDelivery.status === "Failed" ? "danger" : "success"}>
              {formatActivationDeliveryStatus(currentDelivery.status)}
            </Badge>
          </div>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">Email</dt>
              <dd className="text-right text-zinc-900">{currentDelivery.email ?? student.profile.email}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">Expires</dt>
              <dd className="text-right text-zinc-900">{formatDateTime(currentDelivery.expiresAt)}</dd>
            </div>
            {currentDelivery.failureReason ? (
              <div className="flex justify-between gap-4">
                <dt className="text-zinc-500">Failure</dt>
                <dd className="max-w-xs text-right text-rose-700">{currentDelivery.failureReason}</dd>
              </div>
            ) : null}
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            <input
              className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-xs text-zinc-700"
              readOnly
              value={currentDelivery.activationUrl}
            />
            <a
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-zinc-300 px-3 text-sm font-medium text-zinc-800 transition hover:border-zinc-950"
              href={currentDelivery.activationUrl}
              rel="noreferrer"
              target="_blank"
            >
              <ExternalLink aria-hidden className="size-4" />
              Open
            </a>
            <button
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-zinc-300 px-3 text-sm font-medium text-zinc-800 transition hover:border-zinc-950"
              onClick={copyActivationLink}
              type="button"
            >
              <Copy aria-hidden className="size-4" />
              {copyLabel}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
