/**
 * @fileoverview Renders the static campus payment QR code for a vendor's service point.
 * @module features/vendors/VendorPaymentQr
 */

import { Badge } from "@/components/ui/Badge";
import { QrCodeActions } from "@/features/vendors/QrCodeActions";
import { generatePaymentQrSvg } from "@/lib/vendors/paymentQr";

export async function VendorPaymentQr({
  vendorId,
  agentServicePointId,
  companyName,
}: {
  vendorId: string;
  agentServicePointId: string;
  companyName: string;
}) {
  const paymentQrSvg = await generatePaymentQrSvg(vendorId, agentServicePointId);
  const filename = `${companyName.toLowerCase().replace(/\s+/g, "-")}-payment-qr`;

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-md">
      <div className="border-b border-border px-5 py-4">
        <h2 className="text-section-title text-fg">Campus payment QR</h2>
        <p className="mt-1 text-sm text-fg-muted">
          Display this at your service point so students can scan and pay instantly. Verified students receive a
          20% discount automatically.
        </p>
      </div>

      <div className="flex flex-col items-center gap-4 px-5 py-8 text-center">
        <div
          className="size-48"
          dangerouslySetInnerHTML={{ __html: paymentQrSvg }}
          aria-label="Payment QR code"
        />

        <div>
          <p className="font-medium text-fg">Payment QR code</p>
          <p className="mt-1 max-w-xs text-sm text-fg-muted">
            Students scan this and enter the amount on their phone. No need to change this QR code — it works for
            any payment amount.
          </p>
        </div>

        <QrCodeActions svg={paymentQrSvg} filename={filename} />

        <div className="rounded-md border border-border bg-surface-muted px-3 py-2 text-xs text-fg-muted">
          <span className="font-medium">How it works:</span> Student scans → enters amount → wallet pays via
          Ethereum Sepolia → you see the result below.
        </div>

        <Badge tone="version">Sepolia testnet</Badge>
      </div>

      <div className="border-t border-border px-5 py-4">
        <div className="rounded-md border border-border bg-surface-muted px-4 py-3">
          <p className="text-sm font-medium text-fg">Vendor ID</p>
          <p className="mt-0.5 font-mono text-xs text-fg-muted break-all">{vendorId}</p>
        </div>
        <div className="mt-3 rounded-md border border-border bg-surface-muted px-4 py-3">
          <p className="text-sm font-medium text-fg">Service point ID</p>
          <p className="mt-0.5 font-mono text-xs text-fg-muted break-all">{agentServicePointId}</p>
        </div>
        <p className="mt-3 text-xs text-fg-subtle">
          These identifiers are embedded in the QR code and are visible for debugging purposes.
        </p>
      </div>
    </section>
  );
}
