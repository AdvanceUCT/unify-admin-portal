/**
 * @fileoverview Shows vendor payment history from the Ethereum blockchain.
 * @module app/vendor/(portal)/payments/page
 */

import { requireApprovedVendorContext } from "@/lib/vendors/context";

const HOW_PAYMENTS_WORK = [
  {
    title: "Student scans your payment QR",
    description: "They open the Unify wallet, tap Scan, and point the camera at your payment QR code.",
  },
  {
    title: "Student enters the amount",
    description: "They type the amount to pay — for example R35.00 for a meal.",
  },
  {
    title: "Discount applied automatically",
    description:
      "If they hold a valid UCT student credential, a 20% discount is applied on-chain. They pay R28.00 instead of R35.00.",
  },
  {
    title: "Transaction recorded on blockchain",
    description: "The payment is permanently recorded on Ethereum Sepolia with the student number, amount, and timestamp.",
  },
];

export default async function VendorPaymentsPage() {
  await requireApprovedVendorContext();

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-surface p-5 shadow-md">
        <h2 className="text-section-title text-fg">Payment history</h2>
        <p className="mt-1 text-sm text-fg-muted">
          Payments made by students at your service point via the Unify wallet are recorded on the Ethereum Sepolia
          blockchain and will appear here.
        </p>
        <div className="mt-4 rounded-md border border-border bg-surface-muted px-4 py-8 text-center">
          <p className="text-sm font-medium text-fg">No payments yet</p>
          <p className="mt-1 text-sm text-fg-muted">
            Once students scan your payment QR and complete a payment it will appear here with their student number,
            amount, and transaction details.
          </p>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-surface p-5 shadow-md">
        <h2 className="text-section-title text-fg">How payments work</h2>
        <ol className="mt-4 space-y-4">
          {HOW_PAYMENTS_WORK.map((step, index) => (
            <li className="flex gap-3" key={step.title}>
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-600 text-xs font-semibold text-white">
                {index + 1}
              </span>
              <div>
                <p className="text-sm font-medium text-fg">{step.title}</p>
                <p className="mt-0.5 text-sm text-fg-muted">{step.description}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
