/**
 * @fileoverview Provides the Test Tools Panel interaction on `/vendor/test-tools`.
 * @module app/vendor/(portal)/test-tools/TestToolsPanel
 */

"use client";

import { Loader2 } from "lucide-react";
import { useState, useTransition } from "react";

import { generateOwnInvoicesAction, seedOwnVerificationHistoryAction } from "./actions";

export function TestToolsPanel() {
  const [count, setCount] = useState(12);
  const [monthsBack, setMonthsBack] = useState(3);
  const [seedMessage, setSeedMessage] = useState<string | null>(null);
  const [invoiceMessage, setInvoiceMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSeeding, startSeeding] = useTransition();
  const [isGenerating, startGenerating] = useTransition();

  function handleSeed() {
    setError(null);
    setSeedMessage(null);
    startSeeding(async () => {
      try {
        const { created } = await seedOwnVerificationHistoryAction(count, monthsBack);
        setSeedMessage(`Created ${created} verification(s), spread over the last ${monthsBack} month(s).`);
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
        const { backfill, invoices } = await generateOwnInvoicesAction();
        setInvoiceMessage(
          `Backfill: ${backfill.imported} charge(s) created (${backfill.alreadyImported} already existed, ${backfill.notBillable} not billable, ${backfill.pending} still pending, ${backfill.exceptions} exception(s)). ` +
            `Invoices: ${invoices.invoicesIssued} issued${invoices.skippedDisabled ? " — skipped, invoicing is disabled (VERIFICATION_INVOICING_ENABLED)" : ""}.`,
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
        <p className="mt-1 text-sm text-fg-muted">Creates fake, already-completed verifications for your vendor only.</p>
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
          <label className="text-sm">
            <span className="block text-xs text-fg-subtle">Months back</span>
            <input
              className="mt-1 h-9 w-24 rounded-md border border-border px-2 text-sm text-fg"
              max={24}
              min={1}
              onChange={(event) => setMonthsBack(Number(event.target.value))}
              type="number"
              value={monthsBack}
            />
          </label>
          <button
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-brand-600 px-4 text-sm font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSeeding}
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
          your vendor. Treats the current month as already closed, so freshly-seeded current-month history is invoiceable
          immediately instead of waiting for the real month to end.
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
