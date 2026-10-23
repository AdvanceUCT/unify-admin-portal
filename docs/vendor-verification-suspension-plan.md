# Suspend vendor verification for overdue invoices

## Context
At the end of each month vendors get one `VendorInvoice` covering verifications across all their service points. Nothing makes them pay: `dueAt` is never set, and `docs/paystack-vendor-invoicing-plan.md:106` says billing never affects verification. The new rules are:
- A vendor has a configurable window (default 14 days from `issuedAt`) to pay an invoice.
- If an invoice is still unpaid after that window, all verification for that vendor stops, across every service point, both QR and checkout/API.
- Payments, refunds, top-ups and portal access are not affected.
- Paying the overdue invoice(s) is the only way to lift the suspension. Admins cannot override it.
- A student who hits a suspended vendor sees a dedicated wallet page explaining that the problem is on the vendor's side.

### Decisions
| Topic | Decision |
|---|---|
| Scope | Verification only |
| Where it is enforced | A vendor-level suspension in the agent service. One record keyed by `vendorId` (the portal's `VendorProfile.id`) blocks every service point for that vendor. |
| Verification already in progress | Allowed to finish, and is billed normally |
| Reinstatement | Automatic once no overdue invoice remains: right after payment is confirmed, plus a daily backstop. No admin override. |
| Invoices already issued and unpaid when this ships | Grandfathered: `dueAt` stays null, so they never trigger suspension |
| Payment window | `UniversityProfile.invoicePaymentDueDays`, default 14, range 1–365, editable by SUPER_ADMIN on `/settings/verification-billing` |
| Open billing exception | An overdue invoice with `hasUnresolvedException` does not cause a new suspension. Once a vendor is suspended, only payment lifts it. |
| Emails | Out of scope |
| Vendor API | Rejected with `403 VENDOR_VERIFICATION_SUSPENDED` |
| Wallet | Dedicated page with no "Try again" button and no mention of billing |

### The overdue rule (defined once, reused everywhere)
An invoice is **overdue** when `documentStatus = ISSUED`, `paymentStatus = UNPAID`, `dueAt` is not null and `dueAt <= now`. The rule lives in `src/lib/billing/overdue.ts` (`overdueInvoiceWhere` / `isInvoiceOverdue`).

`isDemo` is deliberately not part of the rule: every invoice is currently issued with `isDemo = true` while Paystack runs in test mode, so excluding demo invoices would disable the feature.
- **Suspend** a vendor when they have an overdue invoice with `hasUnresolvedException = false`.
- **Reinstate** a vendor when they have no overdue invoice at all, whatever the exception flag. Voided invoices no longer count.

---

## 1. Agent service (`unify-credo-agent-service`)

**Store**
- `src/services/verificationStore.ts`: add `vendorSuspensions: Record<vendorId, { code: string; suspendedAt: string }>`. An existing store file without this key loads as `{}`.
- Add `getVendorSuspension`, `setVendorSuspension` and `clearVendorSuspension`. They use the same lock and atomic write as the other store methods.
- Put the type in `src/services/verificationTypes.ts`.

**Admin routes** (in `src/api/routes/verifier.ts`, protected by the existing bearer key)
- `PUT /api/verifier/vendors/:vendorId/suspension`, body `{ code: "UNPAID_INVOICE", suspendedAt }`. Validate it the same way the existing routes do.
- `DELETE /api/verifier/vendors/:vendorId/suspension`.
- `GET /api/verifier/vendors/:vendorId/suspension`, used for reconciliation and debugging.
- PUT and DELETE are idempotent, so the portal can safely send the same request again.

**Enforcement** (in `src/services/verificationService.ts`)
- Add `assertVendorVerificationAllowed(servicePoint.vendorId)`. It throws `new AppError(403, 'Vendor verification is suspended.', undefined, 'VENDOR_VERIFICATION_SUSPENDED')`.
- Call it **before** the existing `active` check, so the suspension message wins, at three places:
  - `createCheckoutSession` (~212)
  - `claimCheckoutSession` (~265)
  - `startSession` (~332)
- `syncSession` and `handleProofStateChanged` stay unchanged, so in-flight proofs finish.
- Document the routes and `VENDOR_VERIFICATION_SUSPENDED` in the agent README (API summary and a "Vendor suspension" section).

**Tests**
- Extend `src/services/__tests__/verificationService.test.ts`, following the existing `SERVICE_POINT_DISABLED` cases at ~178 and ~303:
  - start, checkout create and claim are each blocked when the vendor is suspended;
  - other vendors are unaffected;
  - a session already started still syncs to Approved;
  - clearing the suspension restores access.
- Extend `src/api/routes/__tests__/verifierRoutes.test.ts` for the new routes: auth, validation, idempotency.

## 2. Admin portal (`unify-admin-portal`)

### Schema and migration
Hand-written SQL in `prisma/migrations/<ts>_vendor_verification_suspension/`, plus the matching `schema.prisma` changes.
- `UniversityProfile.invoicePaymentDueDays Int @default(14)` with `CHECK (1..365)`, next to `paymentWalletOverdraftSuspensionDays`.
- On `VendorProfile`:
  - `verificationSuspensionCode VendorVerificationSuspensionCode?` (new enum with one value, `UNPAID_INVOICE`)
  - `verificationSuspendedAt DateTime?`
  - `verificationSuspensionReason String?`
  - `verificationAgentSyncPending Boolean @default(false)`. This marks that the agent still needs to be told the current state.
- `AuditAction` gets two new values: `VENDOR_VERIFICATION_SUSPENDED` and `VENDOR_VERIFICATION_REINSTATED`.
- Add an index on `VendorInvoice (paymentStatus, dueAt)`.
- No backfill: existing invoices keep `dueAt = null`, which is how they are grandfathered.

### Due date at issuance
- In `src/lib/billing/invoices.ts` → `issueInvoiceForVendorPeriod` (~193-282): when `paymentStatus` is UNPAID, set `dueAt = issuedAt + invoicePaymentDueDays` days. Read the setting the same way the overdraft days are read.
- Add `DEFAULT_INVOICE_PAYMENT_DUE_DAYS` and the min/max constants to `src/lib/billing/constants.ts`.

### Agent client
- In `src/lib/agentClient.ts`, add `setVendorVerificationSuspension(vendorId, body)` and `clearVendorVerificationSuspension(vendorId)` using `agentFetch`, following the verifier calls at ~465-565.

### New module `src/lib/billing/verificationSuspension.ts`
Modelled on `src/lib/vendors/overdraft.ts`: serializable transactions, re-check inside the transaction, audit with `actorId: null`.

- `overdueInvoiceWhere(now)`: a shared Prisma `where` for the overdue rule above.
- `suspendOverdueVendors(now)`:
  - Find vendors that are not suspended and have an overdue invoice with no exception.
  - In a transaction, re-check, then set the code, `suspendedAt`, the reason (for example `Invoice INV-… overdue since {dueAt}`) and `verificationAgentSyncPending = true`. Write the `VENDOR_VERIFICATION_SUSPENDED` audit entry with meta `{ invoiceIds, dueAt }`.
- `reinstateVerificationIfSettled(vendorProfileId)`:
  - Act only when the vendor is suspended with `UNPAID_INVOICE` and has no overdue invoice.
  - Clear the three suspension fields, set `verificationAgentSyncPending = true`, and write the `VENDOR_VERIFICATION_REINSTATED` audit entry.
  - Then sync this vendor straight away.
- `reinstateSettledVendors(now)`: the daily backstop.
- `syncVendorVerificationSuspensions()`:
  - For each vendor with `verificationAgentSyncPending = true`, send PUT (if suspended) or DELETE (if not) to the agent, then clear the flag.
  - A failure leaves the flag set so the next run retries. This is needed because the agent call cannot be part of the DB transaction.
- `runVerificationSuspensionMonitor(now)`: reinstate, then suspend, then sync, and return counts.
- `getVendorVerificationSuspension(vendorProfileId)` and `assertVendorVerificationAllowed(vendor)`. The latter throws `PosApiError("VENDOR_VERIFICATION_SUSPENDED", "This vendor's verifications are suspended until overdue invoices are paid.", 403)`.

### Wiring
- **Daily job:** `src/app/api/cron/vendor-billing/route.ts` calls `runVerificationSuspensionMonitor` after `runVendorInvoiceGeneration` and `runVendorBillingReconciliation`. Reconciliation runs first so that late payments count. The job runs under the existing billing job lease, and the counts go into the response.
- **Payment confirmed:** `confirmInvoicePayment` stays free of agent calls, because CLI scripts (`scripts/billing-reconcile.ts`) import it outside the Next.js server bundle. Instead, its Next.js callers call `reinstateAfterInvoicePayment(result)` on a best-effort basis (catch and log): the Paystack webhook (invoice references only), the vendor reconcile route and the admin reconcile action. The on-demand `/api/cron/vendor-billing-reconcile` route runs `reinstateSettledVendors` plus a sync after its sweep. The daily monitor is the backstop for anything else, including CLI runs.
- **Vendor API:**
  - In `src/lib/vendors/integrations.ts`, inside `authenticateVendorApiKey` (~91-102, next to the payment-suspension block), block the `verification:create` scope while suspended. `verification:read` stays allowed.
  - Also guard `createVendorCheckoutSession` in `src/lib/vendors/verifications.ts` (~364).
  - Fix the catch-all in `src/app/api/vendor/v1/verification-sessions/route.ts` (~14-16) so it returns `PosApiError`'s code and status instead of always `MISSING_SCOPE`. Map the new code to 403 in `src/lib/payments/walletApi.ts` / `posErrors.ts` if needed.
  - Document the code in `src/lib/vendors/integrationGuide.ts`.

### Admin UI (read-only, with no undo control)
- **Settings:** an "Invoice payment window" card on `/settings/verification-billing` (`InvoicePaymentWindowForm.tsx`, `updateInvoicePaymentWindowAction`). It is SUPER_ADMIN-only (`billing-policy:manage`), like the fee policy, and audited as `INVOICE_PAYMENT_WINDOW_UPDATED`.
- **Verification history page:** `src/app/(admin)/vendors/[applicationId]/verification-history/page.tsx`.
  - When the vendor is suspended, show a danger banner: "Verification suspended since {date}: {reason}", with no action.
  - Add a "Due" column to the invoices table.
  - Use a derived display status: `OVERDUE` (danger), `UNPAID` (warning) when not yet due, and PAID / NO PAYMENT REQUIRED as today.
  - Add a summary `Metric` for the overdue count and total.
  - Data comes from `getVendorInvoiceHistory` in `src/lib/billing/invoiceQueries.ts` (~116), extended with `dueAt` and `isOverdue`, plus `getVendorVerificationSuspension`.
- **Admin invoice detail:** show the due date and the overdue status on `src/app/(admin)/vendors/invoices/[invoiceId]/page.tsx`.

### Vendor portal UI
- **Banner:** new `VendorVerificationSuspensionBanner`, modelled on `src/app/vendor/(portal)/payments/VendorWalletStatusBanner.tsx`. It reads "Verification suspended: pay your overdue invoice(s) to restore verification" and links to `/vendor/invoices`. Render it in the vendor `(portal)` layout so it appears on every page.
- **Invoices:** show the due date and an Overdue badge on `src/app/vendor/(portal)/invoices/page.tsx` and on `[invoiceId]/page.tsx`. This uses `listVendorInvoices` / `getVendorInvoiceDocument` in `invoiceQueries.ts`, extended with `dueAt` and `isOverdue`.

### Docs
- Update `docs/paystack-vendor-invoicing-plan.md:106` to state the new rule.

### Tests (Vitest)
- **Unit:** `src/test/billing/`
  - `invoices.test.ts`: `dueAt` uses the setting, and stays null for NO_PAYMENT_REQUIRED.
  - New `verificationSuspension.test.ts`:
    - suspend and reinstate predicates;
    - an exception pauses a new suspension but does not reinstate;
    - grandfathered invoices with null `dueAt` are ignored;
    - sync retries when the agent call fails.
  - `paymentConfirmation.test.ts`: the reinstate hook is called.
  - `vendorBillingCronRoutes.test.ts`: the monitor is invoked.
  - `agentClient.test.ts`: the new calls.
  - The verification-sessions route returns 403 `VENDOR_VERIFICATION_SUSPENDED`.
  - `admin-vendor-verification-history-page.test.tsx`: banner, Due column and OVERDUE status.
- **Integration:** a Postgres test modelled on `src/test-integration/refunds-overdraft-postgres.test.ts` covering issue → overdue → suspend → pay → reinstate, including the audit rows.

## 3. Student wallet (`unify-student-wallet`)
- **`src/lib/api/verification.ts`:** add `VENDOR_VERIFICATION_SUSPENDED` to `REQUEST_ERROR_MESSAGES` (~56-69), as a fallback string. Also export `isVendorVerificationSuspended(error)`, which returns true for an `ApiClientError` with that code.
- **`src/features/verification/VerificationFlowScreen.tsx`:**
  - Add `"vendor-suspended"` to `FlowErrorKind` (:51).
  - `classifyFlowError` returns `"vendor-suspended"` when the predicate matches, so every catch site (session start, checkout claim, and later retries) routes to the new screen.
  - Before the generic request error (:503), render a dedicated screen in the style of the `CREDENTIAL_NOT_CURRENT` screen (:490):
    ```tsx
    <OperationStateScreen tone="warning" eyebrow="Vendor unavailable"
      title="This vendor can't verify right now"
      message="Verification with this vendor is temporarily unavailable because of an issue on the vendor's side. Your wallet and credentials are fine, and no information was shared."
      primaryAction={{ label: "Back to wallet", onPress: () => void continueToWallet() }} />
    ```
    It has no retry action. It has no vendor name either, because `responseError` doesn't keep `details` and a checkout claim has no name yet.
  - Make sure the `errorKind !== "request"` interruption branch (:499) does not catch the new kind.
- These request-phase errors are not saved to activity history, which matches how other request errors are handled.
- **Tests:**
  - `__tests__/verificationFlow.test.tsx`: the suspended screen is shown for both a static session start and a checkout claim, with no "Try again" button.
  - `__tests__/serviceVerification.test.ts`: the new mapping and the predicate.

## Rollout order
1. Release the agent service first. The new routes and checks do nothing until a suspension is set.
2. Release the wallet next. Until it ships, the code falls back to the generic message.
3. Release the portal last: migration, due dates, monitor, UI.

## Demo support (vendor test tools)
- **Seed verification history:** the vendor picks a count and ticks the months to seed, from the current month back to January. Verifications are dealt round-robin across the ticked months; current-month dates never go past "now".
- **Generate invoices:** each invoice is issued as of its own month's close (month end plus the one-hour closing delay), so `issuedAt` and `dueAt` are what the regular job would have produced. Invoices for months that closed more than the payment window ago are therefore already overdue. The action then runs `suspendVendorIfOverdue` for that vendor, applying what the daily job would already have done. The current month is still treated as closed, so its invoice is dated at the end of this month and falls due after that.

Paying the overdue invoices reinstates verification through the normal payment path.

## Verification
- Run each repo's test suite:
  - agent: `npm test`
  - portal: `npm test`, `npm run test:billing`, and the integration config against local Postgres
  - wallet: `npx jest`
- Manual end-to-end test, run locally with all three services:
  1. Issue an invoice through `scripts/billing-invoices.ts`, then set its `dueAt` in the past in the DB.
  2. Call `/api/cron/vendor-billing` with `CRON_SECRET`. Check the audit row, `verificationAgentSyncPending` cleared, and `GET /api/verifier/vendors/:id/suspension` on the agent.
  3. In the wallet, scan a static QR code for **each** of the vendor's branches. Each should show the vendor-suspended page.
  4. A vendor API `POST /api/vendor/v1/verification-sessions` should return 403 `VENDOR_VERIFICATION_SUSPENDED`.
  5. Check the admin verification-history page (banner and OVERDUE status, no undo control) and the vendor portal banner.
  6. Pay the invoice through Paystack test mode. Check the vendor is reinstated immediately, the agent record is cleared, and QR verification works again.
  7. Stop the agent and re-run the cron. The sync flag should stay set, and the next run should complete the sync.
