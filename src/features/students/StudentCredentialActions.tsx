"use client";

import { Copy, LoaderCircle, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import type { ActivationDelivery, BatchIssuanceResult, StudentRecord } from "@/lib/api/types";
import { formatActivationDeliveryStatus, formatDateTime } from "@/lib/formatters";

type StudentCredentialActionsProps = {
  delivery?: ActivationDelivery;
  student: StudentRecord;
};

async function readErrorMessage(response: Response) {
  const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
  return body?.error?.message ?? `Credential issue request failed with status ${response.status}.`;
}

export function StudentCredentialActions({ delivery, student }: StudentCredentialActionsProps) {
  const router = useRouter();
  const [currentDelivery, setCurrentDelivery] = useState<ActivationDelivery | undefined>(delivery);
  const [copyLabel, setCopyLabel] = useState("Copy");
  const [error, setError] = useState<string | null>(null);
  const [isIssuing, setIsIssuing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const canIssue = useMemo(() => {
    const stateAllowsIssue = ["Pending", "Issuing"].includes(student.credential.lifecycleState);
    return stateAllowsIssue && currentDelivery?.status !== "Delivered";
  }, [currentDelivery?.status, student.credential.lifecycleState]);

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

  return (
    <div className="space-y-5">
      <div>
        <h2 className="mb-4 text-base font-semibold text-zinc-950">Available actions</h2>
        {canIssue ? (
          <button
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-zinc-950 bg-zinc-950 px-3 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-200 disabled:text-zinc-500"
            disabled={isIssuing}
            onClick={issueCredential}
            type="button"
          >
            {isIssuing ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : <Send aria-hidden className="size-4" />}
            {isIssuing ? "Issuing..." : "Issue credential"}
          </button>
        ) : (
          <p className="text-sm text-zinc-600">No credential actions are available for this lifecycle state.</p>
        )}
        <p className="mt-3 text-xs leading-5 text-zinc-500">
          Suspend, reinstate, revoke, and renew will stay unavailable until the issuer agent exposes matching lifecycle endpoints.
        </p>
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
          <div className="mt-4 flex gap-2">
            <input
              className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-xs text-zinc-700"
              readOnly
              value={currentDelivery.activationUrl}
            />
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
