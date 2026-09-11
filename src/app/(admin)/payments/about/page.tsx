/**
 * @fileoverview Renders the authenticated administrator page at `/payments/about`.
 * @module app/(admin)/payments/about/page
 */

import Link from "next/link";

import { requireRole } from "@/lib/auth/session";
import { getUniversityProfile } from "@/lib/university/profile";

export default async function PaymentsAboutPage() {
  await requireRole(["SUPER_ADMIN", "ADMIN"]);
  const profile = await getUniversityProfile();
  const universityName = profile?.name ?? "your university";

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-md">
        <div className="space-y-8 p-6">
          <div className="space-y-3">
            <h2 className="text-section-title text-fg">About Payment Services</h2>
            <p className="text-sm leading-relaxed text-fg-muted">
              Payment Services lets students top up a digital wallet in the UNIFY app and spend
              that balance at approved vendors on campus &mdash; canteens, bookstores, transport, and
              similar services &mdash; without needing cash or a card at the point of sale. Enabling
              this for {universityName} means your institution takes on a direct role in that
              money&apos;s journey, not just a technical integration. This page explains what that
              role actually involves before you set anything up.
            </p>
          </div>

          <div className="space-y-3">
            <h3 className="text-base font-semibold text-fg">How the money moves</h3>
            <ol className="list-decimal space-y-3 pl-5 text-sm leading-relaxed text-fg-muted">
              <li>
                <strong className="font-medium text-fg">A student tops up their wallet.</strong>{" "}
                They choose an amount in the UNIFY app and pay by card or EFT. This payment is
                processed by Paystack, UNIFY&apos;s payment partner, and the funds are deposited
                directly into your university&apos;s own Paystack account &mdash; not held by UNIFY,
                and not held by the student.
              </li>
              <li>
                <strong className="font-medium text-fg">
                  The student&apos;s wallet balance is a record, not separate money.
                </strong>{" "}
                What the student sees as &ldquo;my balance&rdquo; is an entry in UNIFY&apos;s ledger
                representing their claim on the funds already sitting in your university&apos;s
                account. All students&apos; top-ups pool together into that one account.
              </li>
              <li>
                <strong className="font-medium text-fg">
                  Spending at a vendor doesn&apos;t move real money yet.
                </strong>{" "}
                When a student pays a vendor through the app, UNIFY simply updates its internal
                records &mdash; the student&apos;s balance goes down, and the vendor&apos;s accrued
                balance goes up. No money actually changes hands at this point.
              </li>
              <li>
                <strong className="font-medium text-fg">
                  Your university pays vendors out on a schedule you choose.
                </strong>{" "}
                On the cadence you set (for example, weekly or monthly), UNIFY calculates what each
                vendor has accrued since their last payout, and that amount is transferred from your
                university&apos;s Paystack account to the vendor&apos;s bank account.
              </li>
            </ol>
          </div>

          <div className="space-y-3">
            <h3 className="text-base font-semibold text-fg">
              What your university is responsible for
            </h3>
            <p className="text-sm leading-relaxed text-fg-muted">
              Enabling payment services means holding real student money, and that comes with real
              obligations, not just a feature toggle:
            </p>
            <ul className="list-disc space-y-3 pl-5 text-sm leading-relaxed text-fg-muted">
              <li>
                <strong className="font-medium text-fg">Safeguarding the funds.</strong> The money
                sitting in your Paystack account belongs, in effect, to the students who topped it
                up. It should be treated with the same care as any other funds held on behalf of
                others.
              </li>
              <li>
                <strong className="font-medium text-fg">Ensuring funds are available for payout.</strong>{" "}
                Vendors need to be paid what they&apos;re owed, on the schedule you&apos;ve
                committed to &mdash; this depends on there being sufficient balance in the account
                when a payout runs.
              </li>
              <li>
                <strong className="font-medium text-fg">Deciding the payout cadence.</strong> You
                choose how often vendors are paid (weekly, monthly, etc.) in{" "}
                <Link className="text-info-fg underline hover:no-underline" href="/settings">
                  Payment Setup
                </Link>
                . More frequent payouts are friendlier to vendor cash flow; less frequent ones are
                simpler to administer.
              </li>
              <li>
                <strong className="font-medium text-fg">Deciding what happens to unused balances.</strong>{" "}
                If a student never spends their full top-up &mdash; for example, on graduating or
                leaving the university &mdash; you should have a clear, documented policy on whether
                that balance is refunded, expires, or carries over. UNIFY doesn&apos;t set this
                policy for you.
              </li>
              <li>
                <strong className="font-medium text-fg">Keeping account access secure.</strong>{" "}
                Whoever holds your Paystack credentials is, in effect, holding the keys to this
                account. Treat them accordingly.
              </li>
            </ul>
          </div>

          <div className="space-y-3">
            <h3 className="text-base font-semibold text-fg">Where Paystack fits in</h3>
            <p className="text-sm leading-relaxed text-fg-muted">
              UNIFY doesn&apos;t process payments itself &mdash; Paystack does. This division
              matters:
            </p>
            <ul className="list-disc space-y-3 pl-5 text-sm leading-relaxed text-fg-muted">
              <li>
                <strong className="font-medium text-fg">UNIFY owns the student and vendor experience:</strong>{" "}
                the wallet interface, the QR-based payment flow, transaction records, and vendor
                payout calculations.
              </li>
              <li>
                <strong className="font-medium text-fg">Paystack owns the actual movement of money:</strong>{" "}
                processing card and EFT payments, holding the connection to your bank account, and
                executing the transfers to vendors. Paystack also handles the compliance and
                security obligations that come with processing payments &mdash; UNIFY never sees or
                stores card details, and this is by design.
              </li>
            </ul>
            <p className="text-sm leading-relaxed text-fg-muted">
              Your relationship with Paystack is direct and independent of UNIFY &mdash; you create
              and own your own Paystack account, and UNIFY simply connects to it using credentials
              you provide.
            </p>
          </div>

          <div className="space-y-3">
            <h3 className="text-base font-semibold text-fg">Getting set up</h3>
            <ol className="list-decimal space-y-3 pl-5 text-sm leading-relaxed text-fg-muted">
              <li>
                <strong className="font-medium text-fg">Create a Paystack account at paystack.com</strong>{" "}
                &mdash; this is done entirely on Paystack&apos;s own site, not inside UNIFY.
              </li>
              <li>
                <strong className="font-medium text-fg">Complete Paystack&apos;s business verification.</strong>{" "}
                This confirms your institution as a legitimate business and links your settlement
                bank account &mdash; the account that will actually receive student top-ups. For
                South African institutions, this typically takes 1&ndash;3 business days once your
                documents are submitted.
              </li>
              <li>
                <strong className="font-medium text-fg">Retrieve your API keys.</strong> Once
                verified, find these in Paystack&apos;s dashboard under API Keys &amp; Webhooks (or
                the Developers overview page, depending on your dashboard version). You&apos;ll see
                both a Public Key and a Secret Key, for both Test and Live modes.
              </li>
              <li>
                <strong className="font-medium text-fg">
                  Enter your Secret Key in{" "}
                  <Link className="text-info-fg underline hover:no-underline" href="/settings">
                    Payment Setup
                  </Link>
                  .
                </strong>{" "}
                Start with your Test key to try everything safely, with no real money involved,
                before switching to your Live key. UNIFY validates the key immediately and never
                displays it again once saved.
              </li>
              <li>
                <strong className="font-medium text-fg">
                  Recommended: restrict your key to UNIFY&apos;s server.
                </strong>{" "}
                Paystack lets you whitelist up to 10 IP addresses per key from your dashboard. Doing
                this means your key can&apos;t be used from anywhere except UNIFY&apos;s own
                servers, even if it were ever exposed.
              </li>
            </ol>
            <p className="text-sm leading-relaxed text-fg-muted">
              Once your key is entered and validated, and you&apos;ve set your payout cadence and
              preferences, you can enable Payment Services from{" "}
              <Link className="text-info-fg underline hover:no-underline" href="/settings">
                Payment Setup
              </Link>
              .
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
