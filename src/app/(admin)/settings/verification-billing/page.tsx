/**
 * @fileoverview Renders the authenticated administrator page at `/settings/verification-billing`.
 * @module app/(admin)/settings/verification-billing/page
 */

import { FileText, History, Percent, Receipt } from "lucide-react";

import { requireRoleForRender } from "@/lib/auth/session";
import { minorToDecimalString } from "@/lib/billing/money";
import { prisma } from "@/lib/db/prisma";
import { SettingsCard } from "../SettingsCard";
import { generateMissingInvoicesAction } from "./actions";
import { UpdateVerificationBillingPolicyForm } from "./UpdateVerificationBillingPolicyForm";

function formatBasisPoints(basisPoints: number) {
  return `${(basisPoints / 100).toFixed(2)}%`;
}

/**
 * `SUPER_ADMIN` and `ADMIN` may both reach this page (invoice generation is
 * an `invoice:issue` action available to both), but editing the fee/revenue
 * split itself stays `SUPER_ADMIN`-only — see `billing-policy:manage` in
 * `src/lib/auth/permissions.ts`.
 */
export default async function VerificationBillingSettingsPage() {
  const session = await requireRoleForRender(["SUPER_ADMIN", "ADMIN"]);
  const canManagePolicy = session.user.role === "SUPER_ADMIN";

  const policies = await prisma.verificationBillingPolicy.findMany({ orderBy: { version: "desc" } });
  const openPolicy = policies.find((policy) => policy.effectiveTo === null) ?? null;

  return (
    <div className="space-y-6">
      <p className="text-sm text-fg-subtle">
        Verification billing is a demo policy for this proof of concept — it is separate from the student payment
        wallet.
      </p>

      <SettingsCard
        description="The rate currently applied to newly completed verifications."
        icon={Receipt}
        title="Current policy"
      >
        {openPolicy ? (
          <dl className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-fg-subtle">Verification fee</dt>
              <dd className="font-medium text-fg">
                {openPolicy.currency} {minorToDecimalString(openPolicy.verificationFeeMinor, openPolicy.currency)}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-fg-subtle">Platform share</dt>
              <dd className="font-medium text-fg">{formatBasisPoints(openPolicy.platformBasisPoints)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-fg-subtle">Effective from</dt>
              <dd className="font-medium text-fg">{openPolicy.effectiveFrom.toISOString().slice(0, 10)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-fg-subtle">Version</dt>
              <dd className="font-medium text-fg">{openPolicy.version}</dd>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-fg-subtle">
            No policy has been bootstrapped yet. Run <code className="font-mono">npm run billing:bootstrap</code>{" "}
            first.
          </p>
        )}
      </SettingsCard>

      {canManagePolicy && openPolicy && (
        <SettingsCard
          description="Creates a new policy version effective immediately."
          icon={Percent}
          title="Change platform percentage"
        >
          <UpdateVerificationBillingPolicyForm />
        </SettingsCard>
      )}

      <SettingsCard
        description="Issues any invoices now due across every vendor — the same idempotent job the monthly schedule runs, triggered on demand."
        icon={FileText}
        title="Generate missing invoices"
      >
        <form action={generateMissingInvoicesAction}>
          <button
            className="h-9 rounded-md border border-border px-3 text-sm font-medium text-fg hover:bg-surface-muted"
            type="submit"
          >
            Generate missing invoices
          </button>
        </form>
      </SettingsCard>

      <SettingsCard description="Every policy version, newest first." icon={History} title="Policy history">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-fg-subtle">
                <th className="py-1 pr-4 font-medium">Version</th>
                <th className="py-1 pr-4 font-medium">Fee</th>
                <th className="py-1 pr-4 font-medium">Platform share</th>
                <th className="py-1 pr-4 font-medium">Effective from</th>
                <th className="py-1 pr-4 font-medium">Effective to</th>
                <th className="py-1 pr-4 font-medium">Source</th>
              </tr>
            </thead>
            <tbody>
              {policies.map((policy) => (
                <tr className="border-t border-border" key={policy.id}>
                  <td className="py-1.5 pr-4 text-fg">{policy.version}</td>
                  <td className="py-1.5 pr-4 text-fg">
                    {policy.currency} {minorToDecimalString(policy.verificationFeeMinor, policy.currency)}
                  </td>
                  <td className="py-1.5 pr-4 text-fg">{formatBasisPoints(policy.platformBasisPoints)}</td>
                  <td className="py-1.5 pr-4 text-fg-muted">{policy.effectiveFrom.toISOString().slice(0, 10)}</td>
                  <td className="py-1.5 pr-4 text-fg-muted">
                    {policy.effectiveTo ? policy.effectiveTo.toISOString().slice(0, 10) : "Current"}
                  </td>
                  <td className="py-1.5 pr-4 text-fg-muted">{policy.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {policies.length === 0 && <p className="py-4 text-sm text-fg-subtle">No policy history yet.</p>}
        </div>
      </SettingsCard>
    </div>
  );
}
