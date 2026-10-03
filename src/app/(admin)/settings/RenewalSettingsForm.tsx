"use client";
import { useState, useTransition } from "react";
import { LoaderCircle, Save } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { formatRenewalDate } from "@/lib/credentials/renewalPresentation";
import {
  getRenewalSettingsPreviewAction,
  saveRenewalSettingsAction,
} from "./actions";

type Change = {
  data: FormData;
  impact: Awaited<ReturnType<typeof getRenewalSettingsPreviewAction>>;
};
const primaryButton =
  "inline-flex h-10 items-center justify-center gap-2 rounded-md bg-brand-600 px-4 text-sm font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50";

export function RenewalSettingsForm({
  startDate,
  expiryDate,
  canEdit,
}: {
  startDate: string;
  expiryDate: string;
  canEdit: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [change, setChange] = useState<Change | null>(null);
  const [pending, transition] = useTransition();
  const close = () => {
    if (!pending) {
      setChange(null);
      setError(null);
    }
  };
  return (
    <>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          setError(null);
          setSaved(false);
          transition(async () => {
            try {
              const impact = await getRenewalSettingsPreviewAction(
                String(data.get("startDate")),
                String(data.get("expiryDate")),
              );
              setChange({ data, impact });
            } catch (error) {
              setError(
                error instanceof Error
                  ? error.message
                  : "Unable to preview the period.",
              );
            }
          });
        }}
      >
        <fieldset
          disabled={!canEdit || pending || !!change}
          className="grid gap-4 sm:grid-cols-2"
        >
          {[
            {
              name: "startDate",
              label: "Annual start",
              value: startDate,
              placeholder: "01-02",
            },
            {
              name: "expiryDate",
              label: "Annual expiry",
              value: expiryDate,
              placeholder: "30-11",
            },
          ].map((field) => (
            <label key={field.name} className="space-y-1.5 text-sm">
              <span className="font-medium text-fg">
                {field.label}{" "}
                <span className="font-normal text-fg-subtle">(DD-MM)</span>
              </span>
              <input
                required
                pattern="[0-9]{2}-[0-9]{2}"
                inputMode="numeric"
                maxLength={5}
                name={field.name}
                defaultValue={field.value}
                placeholder={field.placeholder}
                className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-fg outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:bg-surface-muted disabled:text-fg-subtle"
              />
            </label>
          ))}
        </fieldset>
        <p className="text-sm text-fg-subtle">
          Repeats annually in South African time. Credentials remain valid
          through the expiry day.
        </p>
        {error && !change && (
          <p
            role="alert"
            className="rounded-md border border-danger-border bg-danger-bg px-3 py-2 text-sm text-danger-fg"
          >
            {error}
          </p>
        )}
        {saved && (
          <p
            role="status"
            className="rounded-md border border-success-border bg-success-bg px-3 py-2 text-sm text-success-fg"
          >
            Annual validity period saved.
          </p>
        )}
        {canEdit && (
          <div className="flex justify-end">
            <button disabled={pending} className={primaryButton}>
              {pending ? (
                <LoaderCircle aria-hidden className="size-4 animate-spin" />
              ) : (
                <Save aria-hidden className="size-4" />
              )}
              {pending ? "Reviewing..." : "Save period"}
            </button>
          </div>
        )}
      </form>
      <Dialog
        isOpen={!!change}
        onClose={close}
        title="Update annual validity period?"
      >
        {change && (
          <div className="space-y-4">
            <p className="text-sm">
              This updates dates for future renewals. Existing offers and
              credentials keep their dates.
            </p>
            <div className="grid grid-cols-2 gap-3 rounded-lg bg-surface-muted p-3 text-sm">
              <div>
                <p className="text-fg-subtle">Renewals changing</p>
                <p className="mt-1 font-semibold text-fg">
                  {change.impact.affected}
                </p>
              </div>
              <div>
                <p className="text-fg-subtle">Newly overdue</p>
                <p className="mt-1 font-semibold text-fg">
                  {change.impact.overdue}
                </p>
              </div>
            </div>
            {!!change.impact.changes.length && (
              <details className="text-sm">
                <summary className="cursor-pointer font-medium text-brand-700">
                  Preview affected dates
                </summary>
                <div className="mt-3 max-h-48 space-y-3 overflow-y-auto">
                  {change.impact.changes.map((item, index) => (
                    <div key={index}>
                      <p className="font-medium text-fg">
                        Academic year {item.academicYear}
                      </p>
                      <p className="text-fg-subtle">
                        {formatRenewalDate(item.oldStart)} -{" "}
                        {formatRenewalDate(item.oldExpiry, true)}
                      </p>
                      <p className="text-fg">
                        Changes to {formatRenewalDate(item.newStart)} -{" "}
                        {formatRenewalDate(item.newExpiry, true)}
                      </p>
                    </div>
                  ))}
                  {change.impact.affected > 5 && (
                    <p>Showing the first five changes.</p>
                  )}
                </div>
              </details>
            )}
            {error && (
              <p
                role="alert"
                className="rounded-md border border-danger-border bg-danger-bg px-3 py-2 text-sm text-danger-fg"
              >
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={close}
                className="inline-flex h-10 items-center justify-center rounded-md border border-border px-4 text-sm font-medium text-fg-muted transition hover:bg-surface-muted disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={pending}
                className={primaryButton}
                onClick={() =>
                  transition(async () => {
                    try {
                      setError(null);
                      await saveRenewalSettingsAction(change.data);
                      setChange(null);
                      setSaved(true);
                    } catch (error) {
                      setError(
                        error instanceof Error
                          ? error.message
                          : "Unable to save the period.",
                      );
                    }
                  })
                }
              >
                {pending && (
                  <LoaderCircle aria-hidden className="size-4 animate-spin" />
                )}
                {pending ? "Saving..." : "Confirm and save"}
              </button>
            </div>
          </div>
        )}
      </Dialog>
    </>
  );
}
