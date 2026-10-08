/** Approved vendor owners manage website verification, POS callbacks and API keys. */
import Link from "next/link";
import { Code2, KeyRound, QrCode, ShieldCheck } from "lucide-react";
import { prisma } from "@/lib/db/prisma";
import { requireVendorOwnerContextForRender } from "@/lib/vendors/context";
import {
  getVendorWebhookConfig,
  listVendorApiCredentials,
} from "@/lib/vendors/integrations";
import {
  VendorApiKeySettings,
  VerificationWebhookSettings,
} from "@/features/vendors/VendorIntegrationSettings";
import { PaymentWebhookSettings } from "@/features/vendors/PaymentWebhookSettings";
import { IntegrationsTabs } from "@/features/vendors/IntegrationsTabs";
import {
  IntegrationCodeBlock,
  IntegrationDetails,
  IntegrationNotice,
} from "@/features/vendors/IntegrationUi";
import {
  integrationHeading,
  integrationSubheading,
} from "@/features/vendors/integrationStyles";

function Steps({ payment = false }: { payment?: boolean }) {
  const steps = payment
    ? [
        {
          title: "Create a request",
          description: "Send the sale amount from your backend.",
          icon: Code2,
        },
        {
          title: "Display the QR",
          description: "Let the student open the request in UNIFY.",
          icon: QrCode,
        },
        {
          title: "Confirm PAID",
          description: "Check the payment result on your server.",
          icon: ShieldCheck,
        },
      ]
    : [
        {
          title: "Create a key",
          description: "Generate a verification key for your backend.",
          icon: KeyRound,
        },
        {
          title: "Start verification",
          description: "Create a session and open its verification URL.",
          icon: Code2,
        },
        {
          title: "Confirm the result",
          description: "Check the session result on your server.",
          icon: ShieldCheck,
        },
      ];
  return (
    <ol className="grid gap-5 lg:grid-cols-3">
      {steps.map(({ title, description, icon: Icon }, index) => (
        <li key={title} className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-50 font-semibold text-brand-700">
            {index + 1}
          </span>
          <div>
            <div className="flex items-center gap-2">
              <Icon aria-hidden className="size-5 shrink-0 text-brand-700" />
              <h3 className="text-base font-semibold">{title}</h3>
            </div>
            <p className="mt-1 text-base text-fg-muted">{description}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function WebsiteGuide() {
  return (
    <section
      className="min-w-0 space-y-5"
      aria-labelledby="website-quick-start"
    >
      <div>
        <h2 id="website-quick-start" className={integrationHeading}>
          Quick start
        </h2>
        <p className="mt-1 text-fg-muted">
          Call UNIFY from your backend, as in the TechNest demo integration.
        </p>
      </div>
      <IntegrationCodeBlock>{`POST /api/vendor/v1/verification-sessions
Authorization: Bearer unify_vk_...
Content-Type: application/json

{ "checkoutId": "order_12345" }`}</IntegrationCodeBlock>
      <IntegrationDetails title="Response and polling example">
        <p>
          Redirect the student to the returned <code>verificationUrl</code> and
          save <code>verificationRequestId</code> against your order. This
          abbreviated response shows the fields needed to start verification.
        </p>
        <IntegrationCodeBlock>{`{
  "verificationRequestId": "vr_...",
  "checkoutId": "order_12345",
  "status": "PENDING",
  "verificationUrl": "https://.../verify/..."
}`}</IntegrationCodeBlock>
        <IntegrationCodeBlock>{`GET /api/vendor/v1/verification-sessions/{verificationRequestId}
Authorization: Bearer unify_vk_...`}</IntegrationCodeBlock>
        <p>
          Wait for <code>APPROVED</code> before completing your student-only
          checkout. Handle <code>DECLINED</code>, <code>EXPIRED</code>, and{" "}
          <code>FAILED</code> explicitly.
        </p>
        <p>
          The result includes the decision, failure details, timestamps, and a
          student summary with id, name, and university when available. Raw
          credential attributes are not returned.
        </p>
      </IntegrationDetails>
      <IntegrationDetails title="Website integration checklist">
        <p>
          Use this guidance when connecting a public website, ticket gate, or
          ordering flow. These items are not automatically checked by UNIFY.
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>Add a Verify with UNIFY button where student status matters.</li>
          <li>
            Create sessions from your backend and redirect to the returned URL.
          </li>
          <li>
            Save the request id against your order and keep checkout pending
            until approval.
          </li>
          <li>
            Show declined, expired, and failed states without exposing
            credential details.
          </li>
          <li>
            Review completed sessions in the vendor portal verification history.
          </li>
        </ul>
      </IntegrationDetails>
    </section>
  );
}

function PaymentGuide() {
  return (
    <section
      className="min-w-0 space-y-5"
      aria-labelledby="payment-quick-start"
    >
      <h2 id="payment-quick-start" className={integrationHeading}>
        Payment quick start
      </h2>
      <IntegrationCodeBlock>{`POST /api/vendor/v1/payment-requests
Authorization: Bearer unify_vk_...
Content-Type: application/json

{
  "branchId": "your-branch",
  "orderReference": "sale-001",
  "amountMinor": 3500,
  "currency": "ZAR",
  "idempotencyKey": "unique-sale-key"
}`}</IntegrationCodeBlock>
      <p className="text-fg-muted">
        Amounts use minor units: 3500 is R35.00. Your key needs payment
        permissions and an explicit permitted branch.
      </p>
      <IntegrationDetails title="Polling and cancellation">
        <IntegrationCodeBlock>{`GET /api/vendor/v1/payment-requests/{id}
POST /api/vendor/v1/payment-requests/{id}/cancel
Authorization: Bearer unify_vk_...`}</IntegrationCodeBlock>
        <p>
          Requests expire after ten minutes. Only <code>PAID</code> confirms
          payment; pending, cancelled, and expired requests are not receipts.
        </p>
        <p>
          If a request times out, recover using the original order reference and
          idempotency key. Continue polling when callback delivery is
          unavailable.
        </p>
      </IntegrationDetails>
      <IntegrationDetails title="Refunds">
        <IntegrationCodeBlock>{`POST /api/vendor/v1/payment-requests/{id}/refunds
Authorization: Bearer unify_vk_...
Content-Type: application/json

{ "amountMinor": 1500, "idempotencyKey": "unique-refund-key" }`}</IntegrationCodeBlock>
        <p>
          Use a key with <code>refunds:create</code>. Refunds can only reference
          a PAID request from the key&apos;s branches. Partial and repeated
          refunds are allowed up to the original amount, with no time limit.
        </p>
        <p>
          Reuse the same idempotency key when retrying. Completed refunds,
          including portal refunds, send a signed{" "}
          <code>payment_request.refunded</code> callback. The payment
          request&apos;s <code>refunds</code> list is authoritative.
        </p>
      </IntegrationDetails>
      <IntegrationNotice title="Confirm payment on your server">
        <p>
          Only <strong>PAID</strong> confirms payment. Requests expire after ten
          minutes. Reuse the original reference and idempotency key after a
          timeout.
        </p>
      </IntegrationNotice>
      <Link
        href="/vendor/payment-requests"
        className="inline-block font-medium text-brand-700 underline underline-offset-4"
      >
        View payment requests
      </Link>
    </section>
  );
}

export default async function VendorIntegrationsPage() {
  const { context } = await requireVendorOwnerContextForRender();
  const [apiKeys, webhook, branchRecords] = await Promise.all([
    listVendorApiCredentials(context.vendorProfileId),
    getVendorWebhookConfig(context.vendorProfileId),
    prisma.vendorBranch.findMany({
      where: { vendorProfileId: context.vendorProfileId },
      select: {
        id: true,
        name: true,
        active: true,
        status: true,
        paymentAcceptance: { select: { status: true } },
        vendorProfile: { select: { defaultBranchId: true } },
      },
      orderBy: { name: "asc" },
    }),
  ]);
  const branches = branchRecords.map((branch) => ({
    id: branch.id,
    name: branch.name,
    isDefault: branch.vendorProfile?.defaultBranchId === branch.id,
    paymentEligible:
      branch.active &&
      branch.status === "ACTIVE" &&
      branch.paymentAcceptance?.status === "ACTIVE",
  }));
  return (
    <IntegrationsTabs
      website={
        <div className="space-y-8">
          <div>
            <h2 className={integrationHeading}>Verify student status</h2>
            <p className="mt-2 text-fg-muted">
              Let students verify with UNIFY during your checkout.
            </p>
          </div>
          <Steps />
          <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <WebsiteGuide />
            <VerificationWebhookSettings
              initialWebhook={
                webhook ? { url: webhook.url, enabled: webhook.enabled } : null
              }
            />
          </div>
          <section className="space-y-4 border-t border-border pt-6">
            <h2 className={integrationHeading}>Before you go live</h2>
            <h3 className={integrationSubheading}>Check your integration</h3>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                Confirm results on your server and keep checkout pending until
                approval.
              </li>
              <li>
                Verify webhook signatures and handle repeated events safely.
              </li>
              <li>Handle declined, expired, and failed sessions.</li>
            </ul>
            <p className="text-sm text-fg-muted">
              This is a setup checklist for your team, not a record of completed
              checks.
            </p>
            <div className="flex flex-wrap gap-5 text-base font-medium text-brand-700">
              <Link
                href="/vendor/integrations/guides"
                className="underline underline-offset-4"
              >
                Setup guides
              </Link>
              <Link
                href="/vendor/integrations/reference"
                className="underline underline-offset-4"
              >
                API reference
              </Link>
              <Link
                href="/vendor/integrations/callbacks"
                className="underline underline-offset-4"
              >
                Verification delivery history
              </Link>
            </div>
          </section>
        </div>
      }
      payments={
        <div className="space-y-8">
          <div>
            <h2 className={integrationHeading}>Accept POS payments</h2>
            <p className="mt-2 text-fg-muted">
              Create a fixed-amount request, show its QR, then confirm payment.
            </p>
          </div>
          <Steps payment />
          <PaymentWebhookSettings
            branches={branches}
            guide={<PaymentGuide />}
          />
        </div>
      }
      keys={
        <VendorApiKeySettings
          branches={branches}
          initialApiKeys={apiKeys.map((key) => ({
            ...key,
            createdAt: key.createdAt.toISOString(),
            lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
            revokedAt: key.revokedAt?.toISOString() ?? null,
          }))}
        />
      }
    />
  );
}
