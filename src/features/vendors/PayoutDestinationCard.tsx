/**
 * @fileoverview Vendor payout destination setup card.
 * @module features/vendors/PayoutDestinationCard
 */

import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";

const inputClassName =
  "h-10 rounded-md border border-border bg-surface px-3 text-sm font-normal text-fg outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";
const labelClassName = "grid gap-1 text-sm font-medium text-fg-muted";

export function PayoutDestinationCard({
  action,
  destinationSummary,
  hasDestination,
  payout,
  payoutError,
  returnTo,
  className,
}: {
  action: (formData: FormData) => void | Promise<void>;
  className?: string;
  destinationSummary?: {
    accountHolderName?: string | null;
    accountMask?: string | null;
    bankCode?: string | null;
    bankName?: string | null;
    provider?: string | null;
    providerAccountName?: string | null;
    reference?: string | null;
  } | null;
  hasDestination: boolean;
  payout?: string;
  payoutError?: string;
  returnTo: string;
}) {
  const form = (
    <form action={action} className="space-y-3">
      <input name="returnTo" type="hidden" value={returnTo} />
      <label className={labelClassName} htmlFor="accountHolderName">
        Account holder name
        <input
          className={inputClassName}
          defaultValue={destinationSummary?.accountHolderName ?? ""}
          id="accountHolderName"
          name="accountHolderName"
          required
        />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={labelClassName} htmlFor="bankCode">
          Paystack bank code
          <input
            className={inputClassName}
            defaultValue={destinationSummary?.bankCode ?? ""}
            id="bankCode"
            name="bankCode"
            placeholder="e.g. 250655"
            required
          />
        </label>
        <label className={labelClassName} htmlFor="bankName">
          Bank name
          <input
            className={inputClassName}
            defaultValue={destinationSummary?.bankName ?? ""}
            id="bankName"
            name="bankName"
            placeholder="For display only"
          />
        </label>
      </div>
      <label className={labelClassName} htmlFor="accountNumber">
        Account number
        <input
          autoComplete="off"
          className={inputClassName}
          id="accountNumber"
          inputMode="numeric"
          name="accountNumber"
          placeholder={destinationSummary?.accountMask ?? ""}
          required
        />
      </label>
      <button
        className="h-9 rounded-md bg-brand-600 px-3 text-sm font-medium text-white transition hover:bg-brand-700"
        type="submit"
      >
        Save payout destination
      </button>
    </form>
  );

  return (
    <section className={cn("space-y-5 rounded-xl border border-border bg-surface p-5 text-left shadow-md", className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-section-title text-fg">Payout destination</h2>
          <p className="mt-1 text-sm text-fg-subtle">
            Save the bank destination Paystack will use when settled wallet takings are paid out.
          </p>
        </div>
        <Badge tone={hasDestination ? "success" : "warning"}>
          {hasDestination ? "Saved" : "Required"}
        </Badge>
      </div>

      {payout === "updated" ? (
        <div className="rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
          Payout destination saved. Future payout runs will use the new Paystack recipient.
        </div>
      ) : null}
      {payoutError ? (
        <div className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {payoutError}
        </div>
      ) : null}

      {hasDestination ? (
        <div className="rounded-lg border border-border bg-surface-muted/60 p-4">
          <dl className="grid gap-3 text-sm text-fg-muted sm:grid-cols-2">
            <div>
              <dt className="font-medium text-fg">Account holder</dt>
              <dd>{destinationSummary?.accountHolderName ?? destinationSummary?.providerAccountName ?? "Saved"}</dd>
            </div>
            <div>
              <dt className="font-medium text-fg">Bank</dt>
              <dd>{destinationSummary?.bankName ?? destinationSummary?.bankCode ?? "Saved"}</dd>
            </div>
            <div>
              <dt className="font-medium text-fg">Account</dt>
              <dd>{destinationSummary?.accountMask ?? "Stored securely"}</dd>
            </div>
            <div>
              <dt className="font-medium text-fg">Provider</dt>
              <dd>{destinationSummary?.provider ?? "Paystack"}</dd>
            </div>
          </dl>
        </div>
      ) : null}

      {hasDestination ? (
        <details>
          <summary className="inline-flex h-9 cursor-pointer list-none items-center rounded-md border border-border bg-surface px-3 text-sm font-medium text-fg-muted transition hover:border-border-strong hover:bg-surface-muted hover:text-fg">
            Edit payout destination
          </summary>
          <div className="mt-4">{form}</div>
        </details>
      ) : form}
    </section>
  );
}
