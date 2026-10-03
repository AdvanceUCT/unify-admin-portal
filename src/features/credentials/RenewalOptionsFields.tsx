"use client";
import { useEffect, useState } from "react";
import { ChevronDown, RefreshCw } from "lucide-react";
import type { RenewalOptions } from "@/lib/credentials/academicPeriod";
import { formatRenewalDate } from "@/lib/credentials/renewalPresentation";

type Preview = {
  validFrom: string;
  expiresAt: string;
  academicYear: number;
  finalYear: number;
  renewalDates: string[];
};
export function RenewalOptionsFields({
  value,
  onChange,
  onReady,
  existingFinalYear,
}: {
  value: RenewalOptions;
  onChange: (value: RenewalOptions) => void;
  onReady?: (ready: boolean) => void;
  existingFinalYear?: number;
}) {
  const [responseState, setResult] = useState<{
    key?: string;
    preview?: Preview;
    error?: string;
  }>({});
  const requestKey = `autoRenew=${Boolean(value.autoRenew)}&renewalYears=${value.renewalYears ?? 3}${existingFinalYear ? `&retainUntil=${existingFinalYear}` : ""}`;
  const result: typeof responseState =
    responseState.key === requestKey ? responseState : {};
  useEffect(() => {
    const abort = new AbortController();
    onReady?.(false);
    fetch(`/api/credentials/renewals/preview?${requestKey}`, {
      signal: abort.signal,
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error?.message ?? "Unable to preview issuance.");
        return data as Preview;
      })
      .then((preview) => {
        if (!abort.signal.aborted) {
          setResult({ key: requestKey, preview });
          onReady?.(true);
        }
      })
      .catch((error) => {
        if (!abort.signal.aborted) {
          setResult({ key: requestKey, error: error.message });
          onReady?.(false);
        }
      });
    return () => abort.abort();
  }, [requestKey, onReady]);

  return (
    <div className="mt-4 space-y-3 border-t border-border pt-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {existingFinalYear ? (
          <div className="flex items-center gap-2 text-fg">
            <RefreshCw aria-hidden className="size-4 text-brand-600" />
            <span className="font-medium">
              Auto-renewal through {existingFinalYear}
            </span>
            <span className="text-xs text-fg-subtle">
              Original allowance retained
            </span>
          </div>
        ) : (
          <label className="inline-flex cursor-pointer items-center gap-2.5 font-medium text-fg">
            <input
              type="checkbox"
              className="size-4 rounded border-border accent-brand-600"
              checked={Boolean(value.autoRenew)}
              onChange={(event) =>
                onChange({
                  autoRenew: event.target.checked,
                  renewalYears: value.renewalYears ?? 3,
                })
              }
            />
            Enable auto-renewal
          </label>
        )}
        {value.autoRenew && !existingFinalYear && (
          <label className="flex items-center gap-2 text-fg-muted">
            <span>
              Academic years
              <span className="sr-only">, including this year</span>
            </span>
            <input
              type="number"
              min={1}
              max={100}
              step={1}
              value={value.renewalYears ?? 3}
              onChange={(event) =>
                onChange({ ...value, renewalYears: Number(event.target.value) })
              }
              className="h-9 w-16 rounded-md border border-border bg-surface px-2 text-center text-fg outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            />
            <span className="text-xs text-fg-subtle">Includes this year</span>
          </label>
        )}
      </div>
      {result.error && (
        <p
          role="alert"
          className="rounded-md border border-danger-border bg-danger-bg px-3 py-2 text-danger-fg"
        >
          {result.error}
        </p>
      )}
      {!result.preview && !result.error && (
        <p role="status" className="text-xs text-fg-subtle">
          Resolving validity...
        </p>
      )}
      {result.preview && (
        <div className="rounded-lg bg-surface-muted px-3 py-2.5">
          <dl className="flex flex-wrap gap-x-6 gap-y-2 text-xs">
            <div>
              <dt className="text-fg-subtle">Valid from</dt>
              <dd className="mt-0.5 font-medium text-fg">
                {formatRenewalDate(result.preview.validFrom)}
              </dd>
            </div>
            <div>
              <dt className="text-fg-subtle">Valid through</dt>
              <dd className="mt-0.5 font-medium text-fg">
                {formatRenewalDate(result.preview.expiresAt, true)}
              </dd>
            </div>
            {(value.autoRenew || existingFinalYear) && (
              <div>
                <dt className="text-fg-subtle">Future renewals</dt>
                <dd className="mt-0.5 font-medium text-fg">
                  {result.preview.renewalDates.length}{" "}
                  <span className="font-normal text-fg-muted">
                    through {result.preview.finalYear}
                  </span>
                </dd>
              </div>
            )}
          </dl>
          {(value.autoRenew || existingFinalYear) &&
            !!result.preview.renewalDates.length && (
              <details className="group mt-2 border-t border-border pt-2 text-xs">
                <summary className="flex w-fit cursor-pointer list-none items-center gap-1 font-medium text-brand-700 [&::-webkit-details-marker]:hidden">
                  Renewal schedule{" "}
                  <ChevronDown
                    aria-hidden
                    className="size-3.5 transition group-open:rotate-180"
                  />
                </summary>
                <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto text-fg-muted">
                  {result.preview.renewalDates.map((date) => (
                    <li key={date}>{formatRenewalDate(date)}</li>
                  ))}
                </ul>
              </details>
            )}
        </div>
      )}
    </div>
  );
}
