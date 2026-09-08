# Paystack vendor verification invoicing proposal

Research date: 8 September 2026. Status: proposed implementation; no payment integration or live configuration has been enabled by this document.

The approved proposal is expanded into a [phased implementation handoff](./paystack-vendor-invoicing-implementation-plan.md) with test gates and a separate [Paystack account setup guide](./paystack-vendor-invoicing-paystack-setup.md). Use those documents to implement and configure the demo.

Scope: proof of concept with an online deployment for demonstrations. Recommended provider mode is Paystack test mode even on the deployed site; an online deployment does not require real-money Paystack live mode. Real-money collection is not assumed or enabled by this proposal. [Test Mode and Live Mode](https://support.paystack.com/en/articles/2129922).

## Recommendation

UNIFY should own monthly invoices, their underlying verification charges, payment allocation, and paid/unpaid reporting. Paystack should collect the invoice payment and split its settlement between the university and platform. Keep these records separate from the student wallet ledger, while making the provider adapter reusable for future Paystack wallet top-ups and vendor disbursements.

Use server-initialized checkout with Paystack InlineJS v2 in the portal and a hosted checkout fallback. Confirmed: only vendor owners can view and pay their invoices, with per-branch breakdowns, and the university absorbs invoice payment processing fees. Authorized university administrators retain receivables reporting. Proposed defaults are one full invoice payment at a time and ZAR. Payment terms and tax treatment remain undecided: keep the due date optional and do not interpret missing tax configuration as tax exemption. Demo invoices must be clearly identified; real commercial issuance requires explicit issuer and tax configuration.

Confirmed scope revision: include existing verifications using the billability rule, and do not restrict verification access for nonpayment. Do not add billing suspension, agent access synchronization, or payment-based branch activation. Actual split percentages remain open. Percentages must be editable through a platform-authorized, effective-dated billing setting, with changes applying to future charges only. Given the clarified university collection and vendor payout flow, the recommended account arrangement is university main account and platform subaccount; this recommendation is not yet an implemented configuration.

## What exists and what needs attention

| Area | Repository finding | Implementation consequence |
| --- | --- | --- |
| Usage pricing | `src/lib/vendors/verificationBilling.ts` snapshots fee, currency, billing month, and billability. Approved results are billable unless `isVerified` is explicitly false. | Retain this billability rule unless explicitly changed. |
| Reporting period | Billing months use Africa/Johannesburg. | Month-end cutoffs must use the same timezone, including UTC boundary tests. |
| Invoice and collection | No invoice models, Paystack adapter, checkout, or payment confirmation routes exist. | Add a dedicated verification invoicing domain. |
| Historical stability | Both `applyAgentResult` and `recordVerificationCompletedEvent` in `src/lib/vendors/verifications.ts` calculate and write billing snapshots. A poll followed by a delayed webhook can recalculate pricing or billability. | Establish one transactional finalization boundary before invoicing. Preserve original charges and represent subsequent corrections explicitly. |
| Legacy usage | The billing migration adds defaults without pricing historical completed rows. Existing verifications are explicitly included in scope. | Import all eligible uninvoiced history, preserve existing fee snapshots, and explicitly backfill legacy rows lacking snapshots using a documented demo policy. Retain original month/branch and prevent duplicate allocation. |
| Verification access | Branch QR codes and checkout requests use the external agent. | Payment status has no effect on verification or manual branch state in this scope. |
| External routes | Root `proxy.ts` redirects requests without a session cookie, including webhook and cron paths. | Add narrow exceptions with authoritative signature/secret/API-key authentication in the handlers. |
| Scheduling | `vercel.json` now has a credential automation cron and an authenticated cron route exists. | Reuse this pattern for billing; the older handoff's statement that no cron exists is stale. |
| Wallet architecture | Invoice collections must not post student/vendor wallet entries. Existing `PaymentGatewayEvent` links to wallet transactions. | Use a billing event inbox initially, or deliberately generalize provider events without inventing wallet transactions. |
| Documentation | Older wallet docs specify Payfast and list verification billing as unimplemented. | Record Paystack as the new provider direction and distinguish implemented usage pricing from pending invoicing. |

## How Paystack fits

Paystack has invoice functionality through Payment Requests, and its dashboard supports split groups on professional invoices. This proposal uses local invoices because UNIFY already owns verification usage and needs consistent historical billing and receipt reporting. A provider invoice can be added later if needed; it need not become a second authoritative receivables system. [Payment Requests API](https://paystack.com/docs/api/payment-request/), [transaction splits](https://support.paystack.com/en/articles/2132802).

For the two recipients, use a main Paystack business account and a subaccount. Recommend the university as main account and the platform as subaccount, reflecting the user's clarified intent that the university receives student money and pays vendors. Merchant ownership and invoice issuer remain explicit configuration; the split API does not decide this.

Under the recommended university-main arrangement, initialize with the platform's `subaccount`, the invoice total, and `transaction_charge` equal to the invoice's snapshotted university share in cents. That override allocates a fixed amount to the main account, with the remainder going to the platform subaccount. Set `bearer: "account"` so the university absorbs processing fees. If account ownership is reversed, use the university subaccount, platform share as `transaction_charge`, and `bearer: "subaccount"`. Paystack's processing fee is separate from the platform commission. [Split Payments](https://paystack.com/docs/payments/split-payments/), [Transactions API](https://paystack.com/docs/api/transaction/).

Illustrative pre-tax example, not proposed pricing: 1,000 verifications at R1 each produce a R1,000 invoice. At a 10% platform share, the platform receives R100 and the university receives R900 less processing fees. Confirm that the university share is sufficient to bear fees, including for small invoices and extreme configured percentages; do not silently change the split when initialization rejects it.

Calculate shares per verification using integer cents and basis points, with an explicit rounding rule, then sum those stored shares. For example, round the platform share half-up and allocate the remainder to the university. Do not calculate commission from today's policy when the invoice is paid. A dynamic flat split is another option if more recipients are introduced; Paystack's multi-split percentage shares do not accept decimal figures. [Multi-split Payments](https://paystack.com/docs/payments/multi-split-payments/).

Successful collection and bank settlement are separate events. Mark the invoice paid once the payment is authoritatively confirmed, and track subsequent settlement independently. A delayed bank payout should not label a paying vendor unpaid. [Getting your money](https://support.paystack.com/en/articles/2125314).

### Future wallet account ownership

The clarified flow is university collection, internal UNIFY wallet accounting, and university payment to vendors. This makes a university merchant account the recommended starting point. Paystack supplies collection and disbursement mechanisms; UNIFY tracks individual student balances and vendor amounts owed. This is a technically plausible design, not a finding that Paystack has approved or rejected this particular business arrangement.

Model three explicit provider purposes: verification invoice collection, student wallet top-up, and vendor wallet payout. Configuration may initially resolve them to the same account, but code must not require that. Store the provider account and test/live mode on each attempt; a reusable adapter need not imply shared credentials or shared money.

Verification commission applies only to verification invoice payments. A student top-up funds a student liability in the internal ledger, and later spending determines which vendors are owed funds. Do not split a top-up as verification revenue or pay a vendor before a corresponding wallet spend. Paystack Transfers is documented as available in South Africa and uses an available Paystack balance; payout funding and automatic bank settlement must be designed together. [Transfers](https://paystack.com/docs/transfers/), [How Transfers Work](https://paystack.com/docs/transfers/how-transfers-work/).

For eventual real vendor payouts, Paystack documents a manual payout arrangement that settles collections into the merchant's Paystack balance for later Transfers, including in South Africa. This requires a support request and eligibility checks; the South Africa guidance currently specifies at least one month of transaction history. Alternatively, funds settled into the university bank account require a separately funded Paystack transfer balance to send vendors money through Paystack. A Transfer does not directly debit arbitrary funds in the university's bank account. The settlement-to-balance arrangement is a provider configuration option to evaluate later, not a prerequisite for the present invoice demo. [Manual payouts](https://support.paystack.com/en/articles/2131074), [Transfers](https://support.paystack.com/en/articles/2132866).

For the demo, proceed with test-mode integration; provider onboarding questions do not block simulated payments. Before a future real-money wallet rollout, confirm the university-operated arrangement with Paystack. Its South African terms include payment aggregation restrictions, but that clause alone does not establish that the university's described use is prohibited. No provider rejection has been obtained. [South African terms](https://paystack.com/za/terms).

## Proposed data model

Names are illustrative; these models do not yet exist.

| Record | Purpose and essential invariants |
| --- | --- |
| `VerificationBillingPolicy` | Effective-dated fee, currency, platform basis points, and rounding policy. Expose percentage editing through an authorized platform setting, retaining actor/change history. Derive the university remainder and prevent overlapping policies. Platform controlled; university settlement configuration is separate. |
| `VerificationCharge` | One original charge per verification, retaining policy, original service month, fee and both shares. Immutable after finalization; uniquely bound to the verification. Use restrictive deletion and retain required billing attribution without copying student credential attributes. |
| `VendorInvoice` | Unique invoice number, vendor, issue period, currency, issuer/customer snapshots, issued timestamp, optional due date, totals, and payment state. One regular invoice per vendor/month/currency. Freeze issued contents. |
| `VendorInvoiceItem` | Immutable billed charge and price/share snapshots; each original charge allocated only once. Group by branch/rate on screen while retaining event-level traceability. |
| `VendorInvoicePaymentAttempt` | Invoice, actor, provider account and mode, unique reference, expected amount/currency, settlement destination and split snapshot, checkout access code, provider transaction ID, and outcome. Multiple historical attempts may belong to one invoice. |
| `VendorInvoicePayment` | Verified receipt and allocation to an invoice. Unique provider-account/mode/transaction ID prevents duplicate application. Preserve unexpected additional receipts for resolution. |
| `BillingGatewayEvent` | Authenticated event inbox with provider/account/mode, event type, resource identity, payload hash, minimal replay data, and processing status. Use event-type-specific deduplication; do not assume every Paystack event has a standalone event UUID. |

Use `BigInt` for invoice/receipt totals, exact integer calculations, and strings for money in JSON. Existing per-verification `Int` values can be converted exactly. Validate any conversion to Paystack numeric fields for safe range. Enforce non-negative amounts, share sums, currency consistency, unique allocations, and issued-record immutability in the database as well as the service.

Select effective policy by authoritative completion time for newly finalized charges. Preserve already established historical prices; existing records without share snapshots require an explicit transition policy before collection. Corrections to an invoiced verification create linked debit/credit records, never edits to an issued invoice. Invoice tax treatment, issuer identity, and the commission base must be agreed before issuing real invoices.

Historical inclusion: generate catch-up demo invoices for closed historical months and retain current-month usage for its normal close. Preserve every established fee snapshot, including explicit zero-price snapshots. For completed legacy rows with no billing snapshot, reapply the existing billability rule and use a clearly recorded demo backfill policy/rate rather than claiming a historical price is known. Snapshot the initial configured demo split on historical charges that have none. Record backfill provenance and make the import idempotent. Missing completion timestamps or branch attribution must be reported for resolution rather than guessed or silently discarded; show a labelled unattributed group where branch details cannot be recovered.

## Monthly invoice lifecycle

1. Run an idempotent catch-up import for existing verification history and a daily authenticated job that finds all unclosed eligible months. This includes historical usage and catches up after missed schedules.
2. After the Johannesburg month closes, reconcile outstanding verification results and apply a short configured closing delay.
3. In a database transaction, freeze the period's selected charges into one organisation-level invoice, covering all branches. Use unique period and charge-allocation constraints so concurrent jobs cannot double bill.
4. Issue the invoice with immutable issuer/customer details, line items, currency, total, optional due date, and a portal notification. A zero total does not require checkout.
5. Show it in `/vendor/invoices`, with a detail view, printable/downloadable invoice, required per-branch breakdown (counts, rates, and subtotals), status, and Pay button. Only vendor owners can view/pay their invoices; ordinary vendor staff cannot access invoice pages, downloads, or payment endpoints. Authorized university administrators have separate receivables reporting, not vendor payment authority.
6. Show current-month unbilled usage separately from issued amounts owed.

Late-arriving charges for a closed month appear as labelled prior-period items on the next regular invoice. Retain the original service month separately from invoice issue period. Material corrections use a linked credit/debit document. Never silently reopen a paid invoice or discard late events.

## Payment flow

1. An authenticated vendor owner requests payment of an invoice ID. The server checks ownership, issued/payable state, exact remaining amount, and configured settlement destination. The browser cannot choose price, shares, destination, or vendor identity.
2. Prepare a unique payment attempt transactionally. Reuse a valid unresolved checkout for repeated clicks. Call Paystack outside database locks, then persist the initialization result. A timeout is an unknown outcome to reconcile, not permission to create another charge immediately.
3. The server calls `POST /transaction/initialize`; the frontend opens InlineJS v2 with the returned access code. Retain the returned hosted authorization URL for fallback. Keep the secret key server-only. [Accept Payments](https://paystack.com/docs/payments/accept-payments/), [InlineJS](https://paystack.com/docs/developer-tools/inlinejs/).
4. The browser success callback requests a server refresh/verification and shows a confirming state. It never marks the invoice paid.
5. The public webhook validates `x-paystack-signature` against the request body using HMAC-SHA512 and the correct secret, using a constant-time comparison. Durably record the event before acknowledging it. A background worker must be durable; do not rely on work continuing after a serverless response. [Webhooks](https://paystack.com/docs/payments/webhooks/).
6. Webhook processing, authenticated browser reconciliation, and a scheduled retry worker share one confirmation service. Verify the transaction server-side and match success status, exact amount/currency/reference, expected account/mode, local invoice binding, and expected split evidence. Never trust client-supplied metadata as the ownership link. [Verify Payments](https://paystack.com/docs/payments/verify-payments/).
7. Lock the invoice, record the unique receipt and allocation, and update paid state in one database transaction. Late failure observations must not overwrite a confirmed receipt. Resolve split anomalies as recorded financial exceptions without losing evidence of the collection.
8. If an old checkout and a newer attempt both succeed, retain both receipts, allocate only the amount owed, and flag the excess for an audited refund process. Application idempotency cannot stop a customer from completing two distinct provider checkouts already issued.

Reconcile unresolved attempts even when the browser never returns or a webhook is missed. Track refunds, reversals, and disputes against their original payments with explicit state transitions and an agreed debt policy. Maintain settlement reporting for gross collection, fees, expected shares, actual payouts, and exceptions.

## Payment reporting without enforcement

Show whether each invoice is unpaid or paid, the outstanding amount, payment date, and receipt reference. Payment attempts separately show processing, failed, or unresolved outcomes so a failed attempt does not change the invoice's underlying debt. Exceptional refund/dispute states retain their own records.

No billing status changes verification eligibility, QR behavior, API access, or manual branch activation. With no agreed payment terms, leave due dates unset and report outstanding amounts without declaring invoices overdue. If terms are configured later, any overdue label is informational only under this scope.

## Configuration and setup

Create a Paystack business in test mode, select the intended merchant account owner, and configure its university/platform payout arrangement. Test mode allows integration work without real collections; activation requires the relevant business information and approval before live payments. [Business activation](https://support.paystack.com/en/articles/2125506), [South Africa requirements](https://support.paystack.com/en/articles/2124418).

Proposed application configuration:

- Server-only `PAYSTACK_SECRET_KEY`, expected provider account/mode, and a trusted application URL for callbacks.
- A separate verification invoice payment feature flag; never require `paymentWalletEnabled` for invoice collection. No billing enforcement flag or service is needed.
- Provider account ownership and counterparty subaccount reference (recommended: university main, platform subaccount), university fee bearer, historical import policy, and optional due-date policy. Require a valid split configuration before offering payment.
- An HTTPS webhook URL registered in the matching Paystack environment; use a reachable development tunnel or staging deployment for tests.
- Authenticated billing/reconciliation cron routes and narrow proxy exceptions.

For one university deployment, its own provider configuration is straightforward. If several deployments later share one platform merchant account, use a central webhook receiver and durable routing by stored payment reference; do not expect separate university callback URLs to route provider webhooks automatically.

## Implementation order and acceptance

1. Stabilize immutable verification charges and policy history; add invoice schema and PostgreSQL invariants. Define migration treatment for existing usage.
2. Deliver invoice generation, owner list/detail/download views, and admin receivables reporting. Keep live issuance controlled during migration.
3. Add the Paystack adapter, server-initialized popup/fallback checkout, durable webhook inbox, idempotent payment allocation, and reconciliation.
4. Exercise test-mode payments on the online demo and verify that payment state has no effect on verification access. The POC does not require enabling real-money collection.

Required tests include month-boundary/late-event handling; historical pricing and share preservation after percentage edits; legacy usage treatment; concurrent invoice runs; amount/currency/mode mismatches; invalid signatures; webhook/callback races; duplicate and out-of-order events; unknown initialization outcomes; two successful payment attempts; vendor ownership and staff authorization; unauthenticated provider/cron routing; and unchanged verification eligibility for paid and unpaid vendors. Use real PostgreSQL for financial uniqueness, immutability, and concurrency tests. Use Paystack's documented test scenarios for successful and unsuccessful checkout flows. [Test Payments](https://paystack.com/docs/payments/test-payments/).

Confirmed decisions: existing eligible verifications are included; only vendor owners can view/pay invoices, with required per-branch breakdowns; the university absorbs verification collection processing fees; no nonpayment restrictions; and deployment is for a POC/demo. The configurable demo split and clearly labelled legacy backfill rate can be supplied during setup. Payment terms and tax treatment may remain unconfigured for clearly identified test invoices. Real commercial issuance, if later requested, requires the actual invoice issuer/tax details and provider account setup; this is outside the present demo target.
