/**
 * @fileoverview Provides the Test Tools Panel interaction on `/vendor/test-tools`.
 * @module app/vendor/(portal)/test-tools/TestToolsPanel
 */

"use client";

import { Loader2 } from "lucide-react";
import { useState, useTransition } from "react";

import { generateOwnInvoicesAction, seedOwnVerificationHistoryAction } from "./actions";

type MonthOption = { periodKey: string; label: string };

/** Pre-selects the three months before the current one, or the current month in January. */
function defaultSelectedMonths(months: MonthOption[]) {
  const previous = months.slice(1, 4).map((month) => month.periodKey);
  return previous.length > 0 ? previous : months.slice(0, 1).map((month) => month.periodKey);
}

function suspensionMessage(result: Awaited<ReturnType<typeof generateOwnInvoicesAction>>) {
  if (!result.verificationSuspended) return "";
  return (
    " Some invoices are already past their due date, so verification is now suspended at all your branches; pay them to restore it." +
    (result.agentSyncFailed ? " The agent service could not be reached, so it will enforce this after the next billing run." : "")
  );
}

/** `months` comes from `seedMonthOptions` on the server: the current month back to January, newest first. */
export function TestToolsPanel({ months }: { months: MonthOption[] }) {
  const [count, setCount] = useState(12);
  const [selectedMonths, setSelectedMonths] = useState<string[]>(() => defaultSelectedMonths(months));
  const [seedMessage, setSeedMessage] = useState<string | null>(null);
  const [invoiceMessage, setInvoiceMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSeeding, startSeeding] = useTransition();
  const [isGenerating, startGenerating] = useTransition();

  function toggleMonth(periodKey: string) {
    setSelectedMonths((current) =>
      current.includes(periodKey) ? current.filter((key) => key !== periodKey) : [...current, periodKey],
    );
  }

  function handleSeed() {
    setError(null);
    setSeedMessage(null);
    startSeeding(async () => {
      try {
        const { created } = await seedOwnVerificationHistoryAction(count, selectedMonths);
        setSeedMessage(`Created ${created} verification(s), spread over ${selectedMonths.length} selected month(s).`);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Unable to seed verification history.");
      }
    });
  }

  function handleGenerateInvoices() {
    setError(null);
    setInvoiceMessage(null);
    startGenerating(async () => {
      try {
        const result = await generateOwnInvoicesAction();
        const { backfill, invoices } = result;
        setInvoiceMessage(
          `Backfill: ${backfill.imported} charge(s) created (${backfill.alreadyImported} already existed, ${backfill.notBillable} not billable, ${backfill.pending} still pending, ${backfill.exceptions} exception(s)). ` +
            `Invoices: ${invoices.invoicesIssued} issued${invoices.skippedDisabled ? " — skipped, invoicing is disabled (VERIFICATION_INVOICING_ENABLED)" : ""}.` +
            suspensionMessage(result),
        );
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Unable to generate invoices.");
      }
    });
  }

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-sm font-medium text-fg">1. Seed verification history</h3>
        <p className="mt-1 text-sm text-fg-muted">
          Creates fake, already-completed verifications for your vendor only, spread evenly across the months you select.
        </p>
        <fieldset className="mt-3">
          <legend className="text-xs text-fg-subtle">Months</legend>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-2">
            {months.map((month) => (
              <label className="inline-flex items-center gap-1.5 text-sm text-fg" key={month.periodKey}>
                <input
                  checked={selectedMonths.includes(month.periodKey)}
                  className="size-4 rounded border-border"
                  onChange={() => toggleMonth(month.periodKey)}
                  type="checkbox"
                />
                {month.label}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="block text-xs text-fg-subtle">Count per run</span>
            <input
              className="mt-1 h-9 w-24 rounded-md border border-border px-2 text-sm text-fg"
              max={50}
              min={1}
              onChange={(event) => setCount(Number(event.target.value))}
              type="number"
              value={count}
            />
          </label>
          <button
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-brand-600 px-4 text-sm font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSeeding || selectedMonths.length === 0}
            onClick={handleSeed}
            type="button"
          >
            {isSeeding && <Loader2 aria-hidden="true" className="animate-spin" size={14} />}
            {isSeeding ? "Seeding..." : "Seed verification history"}
          </button>
        </div>
        {seedMessage && <p className="mt-2 text-sm text-success-fg">{seedMessage}</p>}
      </div>

      <div className="border-t border-border pt-6">
        <h3 className="text-sm font-medium text-fg">2. Generate invoices</h3>
        <p className="mt-1 text-sm text-fg-muted">
          Turns your vendor&apos;s unbilled verification history into charges, then issues any invoices now due — only for
          your vendor. Each invoice is dated as if it had been issued when its month closed, so it gets the due date it
          would really have had; invoices already past that date suspend verification just as the nightly billing job
          would. The current month is treated as already closed, so its invoice is due after the month ends.
        </p>
        <div className="mt-3">
          <button
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-brand-600 px-4 text-sm font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isGenerating}
            onClick={handleGenerateInvoices}
            type="button"
          >
            {isGenerating && <Loader2 aria-hidden="true" className="animate-spin" size={14} />}
            {isGenerating ? "Generating..." : "Generate invoices"}
          </button>
        </div>
        {invoiceMessage && <p className="mt-2 text-sm text-success-fg">{invoiceMessage}</p>}
      </div>

      {error && <p className="text-sm text-danger-fg">{error}</p>}
    </div>
  );
}
