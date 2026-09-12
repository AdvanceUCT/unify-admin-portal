/**
 * @fileoverview Explains the UNIFY wallet payment model to administrators.
 * @module app/(admin)/payments/about/page
 */

import Link from "next/link";

import { BackButton } from "@/components/ui/BackButton";
import { requireRoleForRender } from "@/lib/auth/session";
import { getUniversityProfileForRender } from "@/lib/university/profile";

export default async function PaymentsAboutPage() {
  await requireRoleForRender(["SUPER_ADMIN", "ADMIN"]);
  const profile = await getUniversityProfileForRender();
  const universityName = profile?.name ?? "your university";

  return (
    <div className="space-y-6">
      <BackButton href="/vendors?tab=payments" label="Back to Payment Access" />

      <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-md">
        <div className="space-y-8 p-6">
          <div className="space-y-3">
            <h1 className="text-page-title text-fg">How UNIFY wallet payments work</h1>
            <p className="text-sm leading-relaxed text-fg-muted">
              Students top up a UNIFY wallet, then spend that balance at approved on-campus vendor
              branches. For this proof of concept, Paystack is used in test mode for wallet top-ups;
              branch payments and ordinary vendor refunds are internal ledger movements.
            </p>
          </div>

          <div className="space-y-3">
            <h2 className="text-section-title text-fg">Where Paystack fits</h2>
            <ol className="list-decimal space-y-3 pl-5 text-sm leading-relaxed text-fg-muted">
              <li>
                A student chooses a top-up amount in the wallet app and completes Paystack checkout.
              </li>
              <li>
                The server verifies the Paystack transaction before crediting the student wallet.
                The mobile app never stores the Paystack secret and never credits itself from a
                browser redirect.
              </li>
              <li>
                When a student pays a vendor branch, UNIFY debits the student wallet and credits the
                vendor wallet in the internal ledger. No new Paystack charge happens at the point of
                sale.
              </li>
              <li>
                Vendor refunds reverse that internal spend during the short refund window. They are
                not Paystack card refunds.
              </li>
            </ol>
          </div>

          <div className="space-y-3">
            <h2 className="text-section-title text-fg">Approving branch payment access</h2>
            <p className="text-sm leading-relaxed text-fg-muted">
              Payment QR access is approved per branch, not per vendor. Before approving, classify
              the branch as on-campus from{" "}
              <Link className="text-info-fg underline hover:no-underline" href="/vendors?tab=payments">
                Payment Access
              </Link>
              . Approval provisions the vendor wallet account if needed and creates the branch&apos;s
              opaque QR identifier.
            </p>
          </div>

          <div className="space-y-3">
            <h2 className="text-section-title text-fg">Operational boundaries</h2>
            <ul className="list-disc space-y-3 pl-5 text-sm leading-relaxed text-fg-muted">
              <li>
                Keep Paystack credentials in deployment secret storage such as Vercel environment
                variables. This portal does not store Paystack secret keys in the database.
              </li>
              <li>
                Vendor payouts are separate from branch payment approval. The current proof of
                concept can calculate or simulate payout flows, but real disbursement should be
                treated as a separate operational decision.
              </li>
              <li>
                Wallet balances are financial records. Corrections should be explicit ledger
                transactions such as refunds, never direct balance edits.
              </li>
              <li>
                Existing approved payment QRs remain usable even if a branch has not yet been
                classified; new approvals require on-campus classification.
              </li>
            </ul>
          </div>

          <div className="rounded-lg border border-warning-border bg-warning-bg p-4 text-sm leading-relaxed text-warning-fg">
            Before using real funds, {universityName} should confirm payout, safeguarding,
            reconciliation, chargeback, and compliance responsibilities with its payment provider
            and internal finance team.
          </div>
        </div>
      </section>
    </div>
  );
}
