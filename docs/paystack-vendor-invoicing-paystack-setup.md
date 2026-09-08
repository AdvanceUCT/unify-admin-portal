# Paystack setup for the vendor invoice demo

Prepared: 9 September 2026; provider documentation reviewed on 8–9 September. Companion to the [implementation handoff](./paystack-vendor-invoicing-implementation-plan.md). This guide describes setup to do alongside implementation; invoice routes, billing environment variables, and `billing:*` scripts below do not exist yet.

## 1. What you need now

Use a Paystack business representing the university as the main merchant, with your platform represented by one subaccount. The vendor is the customer paying an invoice; do not create a subaccount for each vendor for this feature.

Keep the business integration in test mode for this POC. The portal can be deployed publicly with HTTPS and still use simulated Paystack payments. Paystack distinguishes its test credentials from credentials that process real money. [Test and live modes](https://support.paystack.com/en/articles/2129922).

You do not need Paystack subscriptions, Paystack-hosted invoices, transfer recipients, wallet payout funding, or manual settlements for this invoice demo. UNIFY generates the invoices. Future student top-ups/vendor payouts are separate work.

## 2. Create/select the main business and get test credentials

1. Sign in to the [Paystack Dashboard](https://dashboard.paystack.com/) and create/select the business for the university demo. Select South Africa/ZAR where requested. Use accurate account-owner details; a demo does not require fabricating institutional credentials.
2. Open **Settings → API Keys & Webhooks**, then the test configuration section. Copy the **Test Secret Key** into your local server environment and deployment secret settings. It normally begins `sk_test_`.
3. Do not paste the secret into chat, commit it, put it in an invoice, or use a `NEXT_PUBLIC_` name. The developer can check that it is configured without seeing its value.
4. The dashboard also supplies a test public key. The selected server-initialized/resume-checkout flow does not require us to initialize charges with a public key in browser code.

Dashboard labels may change; the official [API keys and webhooks guide](https://support.paystack.com/en/articles/2123458) shows where the test settings are located. Real-money activation is not needed to demonstrate test transactions.

## 3. Create the platform subaccount

1. While using the test business configuration, open **Subaccounts → New Subaccount**. Name it recognizably, for example “UNIFY Platform — Demo”.
2. Select the appropriate ZAR bank and enter the platform destination details required by Paystack through its dashboard. If Paystack supplies test fixtures for this form, use those. Do not copy Nigerian bank examples from the API docs into a South African setup, or invent an arbitrary account number. If the dashboard will not accept a test subaccount, resolve that with Paystack support; do not switch to live mode to bypass it.
3. Configure a provisional percentage if the form requires one. The API's `percentage_charge` means the **main account's percentage**, so a sample 10% platform allocation corresponds to 90% university/main. This is only a demo example.
4. Save the generated `ACCT_...` code. The developer needs this code, not the raw bank account number.
5. The application will retrieve the subaccount under the test secret and check its active status, ZAR currency, test domain, and integration identity. A similarly named subaccount in another business/mode is not interchangeable.

Subaccounts can be managed in the dashboard/API. Paystack documents the required bank fields and main-account percentage semantics in [Subaccounts API](https://paystack.com/docs/api/subaccount/).

The application will override the default percentage for every nonzero-commission invoice payment using the invoice's stored share amounts. University processing-fee absorption is set server-side with `bearer: "account"`; changing a dashboard default must not change an old invoice's allocation. No multi-split group is necessary for the selected two-party flow. [Split Payments](https://paystack.com/docs/payments/split-payments/).

## 4. Application/deployment settings

The developer must add validation for the following proposed variables. Put local secrets in `.env.local`, which stays uncommitted, and equivalent values in the hosting provider's server environment settings.

```dotenv
# Proposed new variables; keep features off until the matching phase passes.
VERIFICATION_INVOICING_ENABLED=false
VERIFICATION_INVOICE_CHECKOUT_ENABLED=false
PAYSTACK_MODE=test
PAYSTACK_SECRET_KEY=sk_test_REPLACE_IN_PRIVATE_ENV
PAYSTACK_ACCOUNT_REF=university-demo
PAYSTACK_PLATFORM_SUBACCOUNT_CODE=ACCT_REPLACE_WITH_TEST_CODE
PAYSTACK_EXPECTED_INTEGRATION_ID=REPLACE_WITH_CHECKED_INTEGRATION_ID

# Already-existing application variables: configure for the actual environment.
APP_URL=https://YOUR-DEMO-HOST
BETTER_AUTH_URL=https://YOUR-DEMO-HOST
CRON_SECRET=REPLACE_WITH_A_RANDOM_SERVER_SECRET
VERIFICATION_FEE_MINOR=REPLACE_WITH_DEMO_FEE_IN_CENTS
VERIFICATION_FEE_CURRENCY=ZAR
```

Placeholders are explanatory and must be rejected by the implemented configuration checker. `PAYSTACK_EXPECTED_INTEGRATION_ID` is the Paystack business integration ID exposed by authenticated subaccount data. The read-only checker can initially display the safe ID for the operator to match to the intended business and save; enabling checkout requires that binding to be configured. `PAYSTACK_ACCOUNT_REF` is a stable local identifier, not a substitute for that provider validation.

The demo must reject live keys. `NODE_ENV=production` on a deployed Next.js site is compatible with `PAYSTACK_MODE=test`; do not change Node's runtime mode to make test payments work. Account credentials remain feature-scoped so ordinary verification and invoice reads do not require them.

Existing `DATABASE_URL`/`DIRECT_URL`, auth, and agent configuration remain necessary. Production Vercel builds currently apply Prisma migrations automatically; the developer must verify that those URLs identify the intended demo database before deploying.

Set the initial platform percentage and missing-history fee through `billing:bootstrap` after that command is implemented. For illustration only, `1000` basis points is 10% and `125` cents is R1.25. Choose your own demo values. Subsequent percentage edits use the protected policy settings page and preserve historical invoices. An established zero verification fee is preserved rather than replaced with the legacy fee.

## 5. Register webhook and return URLs

Once the implementation is deployed to a stable HTTPS address, return to the test section of **API Keys & Webhooks**:

| Setting | Value |
| --- | --- |
| Test webhook URL | `https://YOUR-DEMO-HOST/api/webhooks/paystack` |
| Optional dashboard test callback URL | `https://YOUR-DEMO-HOST/vendor/invoices` |
| Actual application callback | The backend sets `/vendor/invoices/INVOICE-ID/payment-return` for each transaction. |

The webhook is a server-to-server POST and must be reachable without a login, deployment-password screen, or interactive bot challenge. Its handler authenticates Paystack's signature. Do not make the whole portal public to accomplish this.

The callback is where the browser returns; it does not prove payment. Registering only the callback is insufficient. A localhost webhook cannot receive Paystack's external calls; use the deployed demo or a reachable development tunnel and update the configured URL when that tunnel changes. [Webhook documentation](https://paystack.com/docs/payments/webhooks/).

Use separate test businesses for simultaneously isolated environments, or one stable designated webhook receiver. Avoid repeatedly pointing the same business's webhook to different local/preview deployments while payments are in progress.

## 6. Developer-assisted setup sequence

Run these only once the handoff phases have implemented the commands:

1. Apply/check committed migrations against the demo target; generate Prisma client.
2. Run `npm run billing:bootstrap -- --platform-share-bps <BPS> --legacy-fee-minor <CENTS>` with your chosen demo values.
3. Run `npm run billing:backfill`, inspect its historical counts/amounts/exceptions, then `npm run billing:backfill -- --apply`.
4. Run `npm run billing:invoices`, inspect missing closed-month invoices, then `npm run billing:invoices -- --apply`.
5. Run `npm run billing:paystack-check` and confirm the intended test business, active platform subaccount, ZAR, and university fee bearer.
6. Register the webhook, enable `VERIFICATION_INVOICING_ENABLED`, and enable `VERIFICATION_INVOICE_CHECKOUT_ENABLED` in the test/demo environment after the backend safety tests in Gate 4 pass. This enables the real Paystack test checkout acceptance in Gate 5; it does not imply that acceptance has already passed. Redeploy if required for environment changes.
7. Confirm scheduler configuration and the admin “Reconcile” recovery action. The developer will record the actual supported schedule in the implementation status document.

Expected output is identifiers, counts, and configuration status. None of these commands should print API keys or raw bank/card details. Successful setup does not seed wallet money or mark invoices paid.

## 7. Run the payment demo

1. Sign in as a vendor owner with a positive unpaid historical invoice. Check the branch breakdown and download the demo PDF.
2. Click Pay and use a successful test-card scenario from Paystack's current [test payment details](https://paystack.com/docs/payments/test-payments/). Follow its current expiry/OTP instructions; do not use a real card for the test demo.
3. Confirm the portal changes from confirming to Paid, with the same reference visible in the dashboard's test Transactions view.
4. Check the stored split evidence: university main account receives its gross share less fees, platform receives its configured share. No actual bank deposit is expected in test mode.
5. Repeat with a different invoice using cancellation/failure, and then a successful payment where the browser closes before returning. Confirm webhook/reconciliation updates the latter.
6. Sign in as vendor staff and another vendor owner to check invoice isolation. Check university admin reporting and verify that unpaid vendors can still verify students.

If only current-month usage exists, normal month-end generation will not yet issue it. For a presentation before month-end, the developer can create explicitly labelled prior-month fixtures in a disposable demo workflow; do not change the dates of existing verification records or close a real current month early.

## 8. Troubleshooting

| Symptom | Check |
| --- | --- |
| Billing pages work but Pay is unavailable | Checkout flag, positive payable total, unresolved attempt/exception, test key, and subaccount health. |
| Wrong currency or invalid subaccount | Business/mode mismatch, wrong `ACCT_` code, inactive subaccount, or non-ZAR destination. |
| Invoice stays confirming | Provider test transaction status, webhook reachability/signature, durable inbox error, then owner/admin Refresh or `billing:reconcile`. Do not start another charge immediately. |
| Webhook gets a redirect/HTML | Root proxy exception or deployment protection is blocking server-to-server delivery. |
| Webhook signature fails | Wrong business/test key, rotated key, or request body transformed before signature validation. |
| Incorrect split | Main-versus-subaccount allocation reversed, missing transaction override, or old invoice correctly retaining its old policy. |
| Very small invoice cannot initialize | Provider minimum/fee allocation constraints; record the failure without shifting fees to the vendor. |
| Prior usage is missing | Backfill inventory, pending results, missing timestamp/rate exceptions, current versus closed month, or already allocated charges. |

For the future wallet phase, Paystack's transfer-balance/manual-payout setup will need a separate runbook. It is not required to finish this invoice POC. No real-money account activation, transfer funding, or payout configuration should be performed merely to make this demo pass.
