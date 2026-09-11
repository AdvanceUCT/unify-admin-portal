/**
 * @fileoverview Renders the vendor owner page at `/vendor/test-tools`.
 * @module app/vendor/(portal)/test-tools/page
 */

import { requireVendorInvoiceOwnerContextForRender } from "@/lib/billing/vendorAuthorization";

import { TestToolsPanel } from "./TestToolsPanel";

export default async function VendorTestToolsPage() {
  const { context } = await requireVendorInvoiceOwnerContextForRender();

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-md">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-section-title text-fg">Test tools</h2>
          <p className="mt-1 text-sm text-fg-muted">
            Demo helpers for <span className="font-medium text-fg">{context.companyName}</span> only — everything here is
            scoped to your own vendor account and never affects any other vendor.
          </p>
        </div>
        <div className="px-5 py-5">
          <TestToolsPanel />
        </div>
      </section>
    </div>
  );
}
