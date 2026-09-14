/**
 * @fileoverview Renders the approved vendor page at `/vendor/integrations`.
 * @module app/vendor/(portal)/integrations/page
 */

import { Code2, KeyRound, MousePointerClick, ShieldCheck, Webhook } from "lucide-react";

import { VendorIntegrationSettings } from "@/features/vendors/VendorIntegrationSettings";
import { requireVendorOwnerContextForRender } from "@/lib/vendors/context";
import { getVendorWebhookConfig, listVendorApiCredentials } from "@/lib/vendors/integrations";

const codeBlockClassName =
  "overflow-x-auto rounded-lg border border-border bg-surface-muted p-4 font-mono text-xs leading-relaxed text-fg";

export default async function VendorIntegrationsPage() {
  const { context } = await requireVendorOwnerContextForRender();

  const [apiKeys, webhook] = await Promise.all([
    listVendorApiCredentials(context.vendorProfileId),
    getVendorWebhookConfig(context.vendorProfileId),
  ]);

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-surface p-5 shadow-md">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-page-title text-fg">Website integration</h1>
            <p className="mt-2 max-w-3xl text-sm text-fg-subtle">
              Use these tools to add UNIFY student verification to your own checkout or access-control flow.
              Your website creates a verification session, sends the student to UNIFY, and receives a
              minimal approved/declined result.
            </p>
          </div>
          <span className="inline-flex w-fit items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">
            <ShieldCheck aria-hidden className="size-3.5" />
            Credentials stay privacy-minimal
          </span>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-4">
        {[
          {
            title: "Create an API key",
            description: "Generate a key below and store it only on your server.",
            icon: KeyRound,
          },
          {
            title: "Start a session",
            description: "Your backend calls UNIFY with your checkout or order id.",
            icon: Code2,
          },
          {
            title: "Open verification",
            description: "Redirect or show the returned verification URL to the student.",
            icon: MousePointerClick,
          },
          {
            title: "Read the result",
            description: "Poll the result endpoint or receive a signed webhook.",
            icon: Webhook,
          },
        ].map((step, index) => {
          const Icon = step.icon;
          return (
            <article className="rounded-xl border border-border bg-surface p-4 shadow-sm" key={step.title}>
              <div className="flex items-center gap-2">
                <span className="grid size-8 place-items-center rounded-full bg-brand-600 text-xs font-semibold text-white">
                  {index + 1}
                </span>
                <Icon aria-hidden className="size-4 text-fg-subtle" />
              </div>
              <h2 className="mt-3 text-sm font-semibold text-fg">{step.title}</h2>
              <p className="mt-1 text-sm text-fg-subtle">{step.description}</p>
            </article>
          );
        })}
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.75fr)]">
        <article className="rounded-xl border border-border bg-surface p-5 shadow-md">
          <h2 className="text-section-title text-fg">API quick start</h2>
          <p className="mt-1 text-sm text-fg-subtle">
            This is the same website-style flow used by the TechNest demo integration.
          </p>
          <div className="mt-4 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-fg">1. Create a verification session</h3>
              <pre className={codeBlockClassName}>{`POST /api/vendor/v1/verification-sessions
Authorization: Bearer unify_vk_...
Content-Type: application/json

{
  "checkoutId": "order_12345"
}`}</pre>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-fg">2. Send the student to the returned URL</h3>
              <pre className={codeBlockClassName}>{`{
  "verificationRequestId": "vr_...",
  "checkoutId": "order_12345",
  "status": "PENDING",
  "verificationUrl": "https://.../verify/..."
}`}</pre>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-fg">3. Confirm the outcome from your server</h3>
              <pre className={codeBlockClassName}>{`GET /api/vendor/v1/verification-sessions/{verificationRequestId}
Authorization: Bearer unify_vk_...`}</pre>
            </div>
          </div>
        </article>

        <article className="rounded-xl border border-border bg-surface p-5 shadow-md">
          <h2 className="text-section-title text-fg">Security rules</h2>
          <ul className="mt-3 space-y-3 text-sm text-fg-subtle">
            <li>
              Keep API keys server-side. Never put a `unify_vk_...` key in browser JavaScript or a mobile app.
            </li>
            <li>
              Use a stable `checkoutId` from your own order/cart system. Retrying with the same id resumes the same
              verification instead of creating duplicates.
            </li>
            <li>
              Treat the external result as a minimal decision only: status, failure reason, expiry, and completion time.
              Disclosed credential attributes stay inside the authenticated vendor portal.
            </li>
            <li>
              If you configure a webhook, verify `X-Unify-Signature` against the exact raw JSON body with your webhook
              secret before trusting the event.
            </li>
            <li>
              Use `X-Unify-Event-Id` and your own `checkoutId` to make webhook handling idempotent if UNIFY retries an
              event or your endpoint times out.
            </li>
          </ul>
        </article>
      </section>

      <section className="rounded-xl border border-border bg-surface p-5 shadow-md">
        <h2 className="text-section-title text-fg">TechNest-style website checklist</h2>
        <p className="mt-1 text-sm text-fg-subtle">
          Use this pattern when adding UNIFY to a public website, checkout page, ticket gate, or vendor ordering flow.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {[
            "Add a Verify with UNIFY button at the step where student status matters.",
            "Call UNIFY from your backend route, then redirect the browser to verificationUrl.",
            "Store verificationRequestId against your order so the return page can poll the result.",
            "Keep the customer-facing page in a pending state until polling or webhook says APPROVED.",
            "Show declined, expired, and failed states without exposing credential details.",
            "Review completed website verifications in the vendor portal verification history.",
          ].map((item) => (
            <div className="rounded-lg border border-border bg-surface-muted/60 p-3 text-sm text-fg-muted" key={item}>
              {item}
            </div>
          ))}
        </div>
      </section>

      <VendorIntegrationSettings
        initialApiKeys={apiKeys.map((key) => ({
          ...key,
          createdAt: key.createdAt.toISOString(),
          lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
          revokedAt: key.revokedAt?.toISOString() ?? null,
        }))}
        initialWebhook={webhook ? { url: webhook.url, enabled: webhook.enabled } : null}
      />
    </div>
  );
}
