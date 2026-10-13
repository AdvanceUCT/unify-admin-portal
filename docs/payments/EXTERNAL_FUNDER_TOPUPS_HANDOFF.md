# External Funder Top-Ups — Implementation Handoff

**Ticket:** As an external funder, I want to be able to send funds directly to a student's wallet so that they can only spend those funds at campus services.

**Repositories affected:** `unify-admin-portal` (all functional changes). `unify-student-wallet` requires **no code changes** (see §6.6).

**Status:** Direction agreed. This document is the sole context for implementation. An agent should be able to implement from it directly, or draft a finer-grained plan from it.

---

## 1. Summary

Add a public, no-account web page on the portal (`/fund`) where anyone — a parent, family member, private sponsor or a funding body — identifies a student by **student number + surname**, enters their own name and email and an amount, and pays through **Paystack hosted checkout**. On confirmation the amount is credited to the student's existing closed-loop wallet.

This is a thin extension of the existing **student wallet top-up** pipeline. Paystack initialisation, webhook routing, reconciliation, the stale-attempt cron and ledger posting are all reused. The new work is: a public form, a public return page, a generalised top-up creation function, three nullable columns, rate limiting, an Activity-feed label and a student notification email.

### Why no restriction logic is needed

The "can only spend at campus services" requirement is **already satisfied** by the existing closed-loop wallet:

- `WalletTransactionType` is `TOPUP | SPEND | REFUND | PAYOUT | VENDOR_TOPUP`. There is no student withdrawal or cash-out path. `PAYOUT` applies to vendor accounts only.
- `SPEND` only succeeds against approved, payment-enabled vendor branches.

Funder money is therefore spendable only at approved campus vendors, exactly like student-initiated top-ups. **Do not** build earmarked balances, per-funder sub-wallets or vendor-category restrictions.

---

## 2. Locked decisions

| # | Decision |
|---|---|
| D1 | Approach: a public `/fund` page on the portal. No funder accounts, no app requirement for funders, and no student-generated share links. |
| D2 | Funder types: both individuals and funding bodies use the same form, one student per payment. Bulk/multi-student funding is out of scope (future work). |
| D3 | Spend restriction: the existing closed loop. No new restriction logic. |
| D4 | Student identification: the funder is assumed to know the student number. Lookup requires **student number + surname**, both matching. |
| D5 | Funder display name: typed by the funder (plain text, length-limited) and shown to the student. |
| D6 | Amount limits: the **same** `PAYMENT_TOPUP_MIN_MINOR` / `PAYMENT_TOPUP_MAX_MINOR` as student top-ups (default R10 – R5 000). No separate env var; changing these affects both flows. |
| D7 | Eligibility: funding is allowed if payment wallets are enabled and the student's wallet account is not `SUSPENDED`/`CLOSED`. **Credential status is not checked.** A student who has never activated payments can still be funded (their wallet account is created on demand). |
| D8 | Student notification: the Activity feed **must** show the funding as "From <funder name>". A student email is sent **best-effort** when funds land. |
| D9 | The funder receives Paystack's own payment receipt (sent to the funder email). No UNIFY funder email. |
| D10 | Provider: Paystack test mode, reusing the existing wallet top-up Paystack configuration (`resolvePaystackWalletTopupConfig`). |

---

## 3. Current state (what exists today)

All paths are relative to `unify-admin-portal/`.

### 3.1 Data model (`prisma/schema.prisma`)

- `Student` — `id`, `studentNumber` (unique), `email`, `firstName`, `lastName`, …; optional `walletAccount`.
- `WalletAccount` — `type` (`STUDENT | VENDOR | SYSTEM`), `status` (`ACTIVE | SUSPENDED | CLOSED`), `studentId?` (unique), `systemCode?` (e.g. `GATEWAY_CLEARING`).
- `WalletTransaction` — `type`, `status` (`PENDING | COMPLETED | FAILED`), `amountMinor`, `initiatorAccountId` (the student wallet for top-ups), `reference`, `paymentProvider`, `providerPaymentId`, `idempotencyKey`, …
- `WalletTopupAttempt` — one per student top-up. Key fields: `walletTransactionId` (unique), `studentId`, **`sessionId String?`** (already nullable, `onDelete: SetNull`), `provider`, `providerAccountRef`, `providerMode`, `reference` (unique), `accessCode`, `authorizationUrl`, `providerTransactionId`, `amountMinor`, `currency`, `idempotencyKey`, `initializationFingerprint`, `status` (`PENDING | SUCCEEDED | FAILED | UNKNOWN`), `failureCode`, `lastCheckedAt`, `completedAt`. Unique `(studentId, idempotencyKey)`. There is no "one unresolved attempt" constraint for students (unlike vendor top-ups).

### 3.2 Student top-up flow (`src/lib/payments/topups.ts`)

- `createWalletTopup({ studentId, sessionId, amountMinor, currency, idempotencyKey })`
  - `assertWalletTopupsEnabled()` (env `PAYMENT_WALLET_TOPUPS_ENABLED`), currency check, `normalizeAmountMinor` (enforces D6 limits), `normalizeIdempotencyKey`.
  - **Phase A** `prepareTopupSnapshot`: a serializable transaction checks `universityProfile.paymentWalletEnabled` and that the student `WalletAccount` exists and is `ACTIVE`. It reuses an existing attempt for the same `(studentId, idempotencyKey)`, otherwise creates a `PENDING` `WalletTransaction` (`TOPUP`, reference `unify-wlt-<hex>`) plus a `WalletTopupAttempt`.
  - **Phase B**: `initializeTopupTransaction` (Paystack) with `email: student.email`, `callbackUrl: callbackUrlFor(...)` → `/wallet/topups/return?topUpId&reference`, and `metadata.purpose: "student_wallet_topup"`.
  - Returns `serializeTopupAttempt(...)`, which **includes `resultingBalanceMinor`** (the student's balance) on success.
- `reconcileWalletTopup({ studentId, topUpId, config?, now? })` is the **only** path that credits the wallet. It verifies with Paystack (`verifyTransaction`), checks reference, amount, currency and mode, calls `completePendingTopup` (in `src/lib/payments/posting.ts`; idempotent, posts the `GATEWAY_CLEARING` debit and the student credit), then sets the attempt to `SUCCEEDED` via `prisma.walletTopupAttempt.update`.
- `reconcileWalletTopupByReference({ reference, config? })` is used by the webhook.
- `reconcileStaleWalletTopups(now)` is the cron sweep (`src/app/api/cron/wallet-topups-reconcile/route.ts`) over `PENDING`/`UNKNOWN` attempts older than 120s.
- Callers of `createWalletTopup`: only `src/app/api/wallet/v1/topups/route.ts` (bearer session).

### 3.3 Webhook (`src/app/api/webhooks/paystack/route.ts`)

This verifies the HMAC signature, dedupes, and routes `charge.success` by reference prefix: `unify-wlt-` → `reconcileWalletTopupByReference`. **Funder top-ups use the same prefix and therefore need no webhook change.**

### 3.4 Return page (student)

`src/app/wallet/topups/return/page.tsx` is public (listed in `PUBLIC_ROUTES` in `proxy.ts`). It only redirects to `unifywallet://topup-return?topUpId=…` and credits nothing. **It is not suitable for funders**, who have no app.

### 3.5 Vendor top-up (reference implementation for the web UX)

- Form: `src/app/vendor/(portal)/payments/top-up/page.tsx`. Uses a `randomUUID()` hidden idempotency key and the server action `startVendorTopupAction` in `src/app/vendor/(portal)/payments/actions.ts`, which redirects to `authorizationUrl` or to the return page.
- Return: `src/app/vendor/(portal)/payments/top-up/return/page.tsx` plus the client component `TopUpReturnStatus.tsx`. On load it POSTs a reconcile, then polls a status endpoint using `POLL_DELAYS_MS` from `src/app/vendor/(portal)/invoices/paymentPolling.ts`.
- Reconcile route: `src/app/api/vendor/wallet/topups/[id]/reconcile/route.ts`. It uses `isSameOriginRequest` and `isRateLimited` from `src/lib/billing/paymentRouteGuards.ts` (in-memory, per-process, best-effort).

### 3.6 Activity feed (`src/lib/payments/walletMobile.ts` → `listMobileWalletActivity`)

- Completed items come from `LedgerEntry` rows for the student account, including `walletTransaction.topupAttempt`. For `TOPUP` the title is hard-coded `"Wallet top-up"` and the subtitle is the reference.
- **Pending items**: *all* non-completed `WalletTopupAttempt`s for the student, titled `"Wallet top-up"`.
- Served by `GET /api/wallet/v1/activity`.

### 3.7 Rate-limit and hashing precedent (`src/lib/payments/walletSession.ts`)

- The private `hmac(value)` uses `env.PAYMENT_OTP_PEPPER`.
- OTP activation counts recent rows by `requestedIpHash` and by student within a window (`ACTIVATION_RATE_WINDOW_MS = 10 min`, `MAX_IP_REQUESTS_PER_WINDOW = 10`). The IP is read from `x-forwarded-for` (first value) in `src/app/api/wallet/v1/activations/request/route.ts`.
- `ensureStudentWalletAccount(studentId)` in `src/lib/payments/accounts.ts` is an idempotent upsert.

### 3.8 Email (`src/lib/email/`)

- `templates.ts` renders all emails via `renderEmail(...)` from `layout.ts`, with `studentFooter` already defined.
- Senders follow the pattern in `vendor-wallet.ts`: a console logger outside production, otherwise `sendResendEmail` with `env.RESEND_API_KEY`.
- `AUTH_EMAIL_FROM` is the always-required sender.
- Previews live in `docs/emails/` (`email-previews/*.html|txt`, `index.html`, README stating the email count).

### 3.9 Errors

`src/lib/payments/errors.ts` defines `WalletDomainError` with a closed union of codes. `RATE_LIMITED` and `TOPUP_NOT_FOUND` already exist.

---

## 4. Target flow

```text
Funder (browser, no account)
  │ 1. GET /fund  → form: student number, student surname, funder name, funder email, amount (ZAR), hidden idempotencyKey
  │ 2. Server action startFunderTopupAction
  │       → createFunderTopup(...)  [rate limit → student lookup → ensure wallet → Phase A snapshot → Paystack init (payer = funder email)]
  │       → redirect to Paystack authorization_url
  │ 3. Pays on Paystack (Paystack emails receipt to funder)
  │ 4. Paystack redirects → /fund/return?topUpId=…&reference=…
  │       → page POSTs /api/fund/topups/reconcile {topUpId, reference}, then polls GET /api/fund/topups/status
  │       → shows Pending / Succeeded / Failed — never the student's balance or personal details
  │
  ├── In parallel: Paystack webhook (unify-wlt-*) and the stale cron reconcile the same attempt (existing, unchanged)
  │
  └── On the first transition to SUCCEEDED:
        - wallet credited (existing completePendingTopup)
        - best-effort email to the student: "<Funder name> sent you R…"
        - student Activity feed shows "From <Funder name>"
```

---

## 5. Security and privacy invariants

These are mandatory and must be covered by tests.

1. **No student data leaks to funders.** No funder-facing page, action or route may return the student's name, email, balance, wallet status or any other attribute. In particular, **never** return `serializeTopupAttempt` output (it includes `resultingBalanceMinor`) to a funder.
2. **No existence oracle.** Unknown student number, surname mismatch, no wallet-enabled university, and a suspended/closed student wallet all produce the **same** funder-facing message, e.g. "We couldn't accept funding for that student. Check the student number and surname." Each case must still be logged distinctly server-side (no PII in logs beyond IDs).
3. **Surname match**: compare `trim()` + case-insensitive (`toLocaleLowerCase("en-ZA")`) and collapse internal whitespace. Exact match only; no fuzzy matching.
4. **Browser return is never proof.** Crediting happens only via `reconcileWalletTopup`, which verifies with Paystack, as today.
5. **Funder status/reconcile capability = `topUpId` + `reference` pair.** Both must match the same funder attempt (`funderEmail IS NOT NULL`). The reference is random (`unify-wlt-` + 20 hex chars), so the pair is unguessable. Reject student-initiated attempts on these routes.
6. **Funder text is untrusted.** `funderName` is shown in the student app and email. It is plain text only, trimmed, 2–60 characters, with control characters stripped. React and the email renderer escape it; never insert it as HTML.
7. **Rate limiting** applies on creation (DB-backed, §6.3) and on the public reconcile/status routes (in-memory `isRateLimited`).
8. **Funder pending/abandoned attempts must not appear in the student's feed** (§6.6). Otherwise anyone could spam a student's Activity with pending items.

---

## 6. Changes, in dependency order

Each step lists its files, the required behaviour and what done looks like.

### 6.1 Schema and migration

**Files:** `prisma/schema.prisma` and a new migration `prisma/migrations/<timestamp>_add_funder_wallet_topups/migration.sql`. Use a timestamp later than `20261007120000`.

Add to `WalletTopupAttempt`:

```prisma
funderName    String?
funderEmail   String?
funderIpHash  String?

@@index([funderIpHash, createdAt])
```

- A funder attempt is defined as `funderEmail IS NOT NULL`. Do not add an enum or a new table.
- Optionally add a DB check constraint to the SQL: `("funderEmail" IS NULL) = ("funderName" IS NULL)`, so that name and email are both present or both absent.
- Run `npm run prisma:generate`.

**Done when:** the migration applies cleanly on an existing DB and existing rows are unaffected (all new columns are NULL).

### 6.2 Error code and hashing helper

- `src/lib/payments/errors.ts`: add `"FUNDING_RECIPIENT_NOT_ELIGIBLE"` to the code union. This is the single external error used for invariant 2.
- Make the `PAYMENT_OTP_PEPPER` HMAC reusable. Either export `hmac` from `walletSession.ts` or move it to a small module (e.g. `src/lib/payments/hashing.ts`) imported by both. Behaviour must stay identical for the OTP code.

### 6.3 Generalise top-up creation (`src/lib/payments/topups.ts`)

Refactor so student and funder creation share Phase A and Phase B.

1. Introduce an origin type:
   ```ts
   type TopupOrigin =
     | { kind: "student"; sessionId: string }
     | { kind: "funder"; funderName: string; funderEmail: string; funderIpHash: string | null };
   ```
2. `prepareTopupSnapshot` takes the origin:
   - `student`: unchanged; store `sessionId`.
   - `funder`: store `sessionId: null` plus `funderName`, `funderEmail` and `funderIpHash`. Include the funder email in `initializationFingerprint`.
   - The idempotency-reuse branch must also reject reuse if the origin kind or funder email differs from the existing attempt (`IDEMPOTENCY_CONFLICT`).
3. Phase B:
   - Payer `email`: `student.email` for student, `funderEmail` for funder.
   - `callbackUrl`: student is unchanged (`/wallet/topups/return`); funder uses `new URL("/fund/return", env.APP_URL)` with `topUpId` and `reference` params.
   - `metadata.purpose`: `"student_wallet_topup"` for student, `"funder_wallet_topup"` for funder.
4. Keep `createWalletTopup({ studentId, sessionId, ... })` with its **existing signature** as a thin wrapper (origin `student`), so `src/app/api/wallet/v1/topups/route.ts` and `src/test/payment-wallet-routes.test.ts` are unaffected.
5. Add `createFunderTopup(input)`:
   ```ts
   createFunderTopup({
     studentNumber: string; studentSurname: string;
     funderName: string; funderEmail: string;
     amountMinor: number; currency: "ZAR";
     idempotencyKey: string; ipAddress: string | null;
   }): Promise<FunderTopupResult>
   ```
   Order of operations:
   1. `assertWalletTopupsEnabled()`, currency, `normalizeAmountMinor` (same D6 limits), `normalizeIdempotencyKey`.
   2. Validate `funderName` (invariant 6) and `funderEmail` (Zod `.email()`, max 254, lower-cased).
   3. **Rate limit** (DB-backed, inside a short transaction, modelled on `walletSession.ts`):
      - per IP: count `WalletTopupAttempt` with `funderIpHash = hmac("ip:"+ip)` and `createdAt >= now - 10 min`; limit **10**.
      - per student: count funder attempts (`funderEmail not null`) for the resolved student with `status in (PENDING, UNKNOWN)` and `createdAt >= now - 10 min`; limit **5**.
      - On breach, throw `RATE_LIMITED`. This error may be shown to the funder; it doesn't reveal whether the student exists, provided the per-IP check runs **before** the student lookup and the per-student check reuses the generic message.
   4. Look up the student by `studentNumber` (trimmed, exact) and compare the surname (invariant 3). On failure, throw `FUNDING_RECIPIENT_NOT_ELIGIBLE`.
   5. `ensureStudentWalletAccount(student.id)` (D7).
   6. Phase A with the `funder` origin. Map `PAYMENT_WALLET_DISABLED` (from the university check), `ACCOUNT_SUSPENDED`, `ACCOUNT_CLOSED` and `ACCOUNT_NOT_FOUND` to `FUNDING_RECIPIENT_NOT_ELIGIBLE`. The env-level `assertWalletTopupsEnabled` failure may also map to it, or the page can show "Funding is currently unavailable" based on the env flag (see §6.4).
   7. Phase B as in step 3 above.
   8. Return a **funder-safe** result via a new serializer:
      ```ts
      type FunderTopupResult = {
        topUpId: string; reference: string;
        status: "PENDING" | "SUCCEEDED" | "FAILED" | "UNKNOWN";
        authorizationUrl?: string;   // only while PENDING
        amountMinor: number; currency: "ZAR";
        completedAt?: string; failureCode?: string;
      };
      ```
      No balance, no student fields.
6. Add funder status and reconcile helpers:
   - `getFunderTopup({ topUpId, reference })`: finds the attempt with `id = topUpId AND reference = reference AND funderEmail IS NOT NULL`, otherwise `TOPUP_NOT_FOUND`. Returns `FunderTopupResult`.
   - `reconcileFunderTopup({ topUpId, reference })`: same lookup, then calls the existing `reconcileWalletTopup({ studentId: attempt.studentId, topUpId })` and re-serializes with the funder serializer. Never pass through the student serializer's output.
7. In `reconcileWalletTopup`, make the final success write **conditional** so exactly one caller observes the transition:
   ```ts
   const { count } = await prisma.walletTopupAttempt.updateMany({
     where: { id: attempt.id, status: { not: WalletTopupAttemptStatus.SUCCEEDED } },
     data: { status: SUCCEEDED, completedAt, failureCode: null },
   });
   if (count === 1 && attempt.funderEmail) await notifyStudentOfFunding(attempt.id); // §6.7, best-effort
   ```
   Then reload the attempt for the existing return value. Behaviour for student top-ups is otherwise unchanged.

**Done when:** existing student top-up tests pass unchanged. A funder attempt is created with the funder email sent to Paystack and the `/fund/return` callback, and it is credited by the existing webhook and cron paths.

### 6.4 Public funding page and server action

**Files (new):**
- `src/app/(public)/fund/page.tsx`
- `src/app/(public)/fund/actions.ts`
- `proxy.ts`, two edits:
  - Add `"/fund"` to `PUBLIC_ROUTES`. `isPublicRoute` matches `route` and `route/…`, so this also covers `/fund/return`.
  - Add `pathname.startsWith("/api/fund")` to `shouldSkipProxy`, alongside `/api/wallet`. Otherwise unauthenticated calls to the §6.5 routes are redirected to `/sign-in`. These routes protect themselves with the `topUpId`+`reference` capability, a same-origin check and rate limiting.

**Page (server component):**
- If `!env.PAYMENT_WALLET_TOPUPS_ENABLED`, or no university profile has `paymentWalletEnabled`, render "Funding is currently unavailable."
- Header: university name and logo (from `UniversityProfile`, as other public pages do). Copy: "Send funds to a student's UNIFY wallet. Funds can only be spent at approved campus vendors."
- Fields:
  - Student number
  - Student surname
  - Your name (as the student will see it)
  - Your email (for your Paystack receipt)
  - Amount (R), showing the min/max from env
  - Hidden `idempotencyKey` = `randomUUID()`
- Error display via a `?fundError=` query param, following the vendor top-up page.
- Follow the existing design system (`docs-local/DESIGN_SYSTEM.md`, shared `components/ui`).

**Server action `startFunderTopupAction(formData)`:**
- Read the client IP from `headers()` → `x-forwarded-for` (first value).
- Convert rands to minor units. `randToMinor` is currently private in `src/app/vendor/(portal)/payments/actions.ts`; move it to a shared module (e.g. `src/lib/formatters.ts`) and import it from both actions.
- Call `createFunderTopup`, then redirect to `authorizationUrl`, or to `/fund/return?topUpId&reference` if the status is not pending.
- On `WalletDomainError`, redirect back to `/fund?fundError=<message>`, using only the funder-safe messages below. Never use `error.message` from unexpected errors:

| Code | Message to funder |
|---|---|
| `FUNDING_RECIPIENT_NOT_ELIGIBLE` | "We couldn't accept funding for that student. Check the student number and surname." |
| `TOPUP_AMOUNT_OUT_OF_RANGE` | "Enter an amount between R{min} and R{max}." |
| `RATE_LIMITED` | "Too many attempts. Please wait a few minutes and try again." |
| `PAYMENT_WALLET_DISABLED` | "Funding is currently unavailable." |
| anything else | "We couldn't start the payment. Please try again." |

Server actions get same-origin protection automatically.

### 6.5 Funder return page and public status/reconcile routes

**Files (new):**
- `src/app/(public)/fund/return/page.tsx` (server component): reads `topUpId` and `reference`; if either is missing, show a generic "Payment not found" page; otherwise loads `getFunderTopup`, mapping `TOPUP_NOT_FOUND` to the same not-found page.
- `src/app/(public)/fund/return/FunderTopUpStatus.tsx` (client): adapted from `TopUpReturnStatus.tsx`. If not final, it POSTs reconcile once, then polls status with `POLL_DELAYS_MS`. States:
  - **Confirming/Pending**: "Confirming your payment…" with a manual "Check again".
  - **Succeeded**: "Payment received. R{amount} has been added to the student's wallet." Show the reference. Nothing about the student.
  - **Failed**: "The payment was not completed. You have not been charged." plus a link back to `/fund`.
  - **Unknown after polling**: "We're still confirming this payment. You'll receive a Paystack receipt if it succeeded; the student's wallet will be credited automatically."
- `src/app/api/fund/topups/status/route.ts` — `POST { topUpId, reference }` → `getFunderTopup`. POST rather than GET keeps the reference out of access logs.
- `src/app/api/fund/topups/reconcile/route.ts` — `POST { topUpId, reference }` → `reconcileFunderTopup`.
- Both routes:
  - Zod body validation.
  - `isSameOriginRequest` and `isRateLimited(\`fund-topup:${topUpId}\`)`.
  - Respond `Cache-Control: private, no-store, max-age=0`.
  - Errors through `walletErrorResponse` or an equivalent that returns only `{ error: { code, message } }` with funder-safe messages.

### 6.6 Activity feed (`src/lib/payments/walletMobile.ts`)

In `listMobileWalletActivity`:

1. **Completed items:** for `TOPUP`, set the title to `` `From ${transaction.topupAttempt.funderName}` `` when `topupAttempt?.funderName` is set, otherwise keep `"Wallet top-up"`. Keep the subtitle as the reference.
2. **Pending items:** add `funderEmail: null` to the `walletTopupAttempt.findMany` `where`, so only student-initiated pending/failed attempts are listed (invariant 8).

**Mobile app (`unify-student-wallet`): no change required.**
- `walletActivitySchema` in `src/features/payment/paymentApi.ts` accepts any non-empty `title`, and `type: "TOPUP"` is unchanged.
- `src/features/wallet/unifiedActivity.ts` uses `item.title` for top-ups.
- The item appears under the existing "Top-ups" filter with the `CreditCard` icon.

Verify on device that "From Jane Doe" renders without truncation issues. Do not change the app unless that check fails.

### 6.7 Student notification email (best-effort)

**Files:**
- `src/lib/email/templates.ts`: add `renderFunderTopupReceivedEmail({ studentName, funderName, amount })` using `studentFooter`.
  - Subject: "You've received funds in your UNIFY wallet"
  - Heading: "Funds received"
  - Body: "Hi {studentName}, {funderName} sent R{amount} to your UNIFY wallet. You can spend it at approved campus vendors using the Student Wallet."
  - No balance and no links (the student may not have activated payments yet).
- `src/lib/email/funder-topup.ts` (new): `sendFunderTopupReceivedEmail(...)` following the `vendor-wallet.ts` pattern (console logger outside production, Resend in production, `from: env.AUTH_EMAIL_FROM`).
- `src/lib/payments/topups.ts`: `notifyStudentOfFunding(attemptId)` loads the student (email, first/last name) and the attempt (funder name, amount), formats with `formatMoneyMinor`, and calls the sender.
  - Wrap it in `try/catch`: on failure, `console.warn` with the attempt ID only. **Never** throw into the reconcile path, because the webhook must still return 200 and the credit must stand.
- Add the preview to `docs/emails/email-previews/` (`funder-topup-received.html` / `.txt`) and `docs/emails/index.html`, and update the email count in `docs/emails/README.md`. Use fictional data.

Accepted limitation: if a crash occurs after `completePendingTopup` but before the conditional `SUCCEEDED` write, later reconciles return early because the transaction is `COMPLETED`, so the email is skipped. The credit and feed entry are unaffected. Document this; don't engineer around it.

### 6.8 Tests (Vitest, colocated with existing payment tests under `src/test/`)

Add `src/test/funder-topups.test.ts` (mock Paystack client and Prisma, following the existing payment tests). Cover at least:

1. Creates a funder attempt: `sessionId` null and funder fields stored; Paystack called with the **funder** email, the `/fund/return` callback and `purpose: "funder_wallet_topup"`.
2. Surname mismatch, unknown student number, wallet disabled and suspended/closed wallet all yield `FUNDING_RECIPIENT_NOT_ELIGIBLE` with an identical message.
3. Surname match is case- and whitespace-insensitive.
4. Amount outside `PAYMENT_TOPUP_MIN_MINOR`/`MAX_MINOR` → `TOPUP_AMOUNT_OUT_OF_RANGE`.
5. Per-IP and per-student rate limits → `RATE_LIMITED`; the per-IP check occurs before the student lookup.
6. Creates a wallet account for a student with none (calls `ensureStudentWalletAccount`).
7. Idempotency: the same key and same payload reuse the attempt; the same key with a different amount or funder email → `IDEMPOTENCY_CONFLICT`.
8. The funder serializer never includes `resultingBalanceMinor` or student fields. Assert on object keys.
9. `getFunderTopup`/`reconcileFunderTopup` reject a mismatched reference and reject student-initiated attempts (`TOPUP_NOT_FOUND`).
10. Reconcile success sends the student email **exactly once** across two concurrent or sequential reconciles. An email failure does not throw, and the attempt still ends `SUCCEEDED`.
11. Activity feed: a completed funder top-up is titled "From <name>"; pending/failed funder attempts are excluded; student pending attempts are still included.
12. The existing `payment-wallet-routes.test.ts` passes unmodified (`createWalletTopup` signature preserved).
13. `proxy.test.ts`: `/fund` and `/fund/return` are public, and `/api/fund/topups/*` is not redirected to sign-in.
14. Email template render test, following `email-templates.test.ts`.

Run: `npm run typecheck`, `npm run lint`, `npm test`. If DB-backed payment tests exist for top-ups (`npm run test:payments:db`), add one funder happy-path case.

### 6.9 Documentation

- Add a short section to `README.md` (Admin Portal → capabilities table and routes) for `/fund`, noting it is public and how crediting works.
- Add a "Funding a student" note to the wallet README's "Payment and top-up flows": funded amounts appear in Activity as "From <name>".
- Add a line to `docs/payments/` or `docs/system/OPERATIONS_RISKS_AND_NEXT_STEPS.md` covering:
  - third-party funding of stored value (FICA/SARB considerations, documentation only, consistent with the existing SARB note in `docs/payments/REFUNDS_OVERDRAFT_PAYOUTS.md`)
  - bulk funding as future work

---

## 7. Out of scope

- Funder accounts, funder dashboards, funding history for funders, or UNIFY-issued funder receipts.
- Bulk/multi-student funding (CSV or batch). Recorded as future work for funding bodies.
- Earmarked/restricted funds, sub-balances, or vendor-category spend rules.
- Credential-status checks on the recipient.
- Refunds of funder payments back to the funder's card.
- Any change to the Paystack webhook router, the stale-top-up cron, ledger posting or vendor flows.
- Any change to the mobile app, unless the on-device title check in §6.6 fails.

---

## 8. Manual demo script (Paystack test mode)

1. Ensure `PAYMENT_WALLET_TOPUPS_ENABLED="true"`, the university has the payment wallet enabled, and the Paystack test keys and webhook are configured (see `docs/payment-wallet-development-setup.md`).
2. Open `/fund` in a private browser window (no session). Enter a seeded student's number and surname, a funder name and email, and R50.
3. Pay with a Paystack test card. You are returned to `/fund/return`, which shows "Payment received". Confirm that no student details are shown.
4. In the Student Wallet app (payments activated for that student): the balance increased by R50, and Activity shows "From <funder name>" under Top-ups.
5. Check the dev console (or inbox in production) for the student email.
6. Spend the funds at an approved vendor branch via POS checkout. This confirms closed-loop spend works unchanged.
7. Negative checks: a wrong surname shows the generic error; 11 rapid submissions from one IP are rate limited; abandoning checkout leaves the student's Activity unchanged.

---

## 9. File checklist

| Area | File | Change |
|---|---|---|
| Schema | `prisma/schema.prisma`, new migration | Funder columns + index |
| Errors | `src/lib/payments/errors.ts` | `FUNDING_RECIPIENT_NOT_ELIGIBLE` |
| Hashing | `src/lib/payments/walletSession.ts` (+ optional `hashing.ts`) | Reusable `hmac` |
| Core | `src/lib/payments/topups.ts` | Origin refactor, `createFunderTopup`, funder serializer, `getFunderTopup`, `reconcileFunderTopup`, conditional success write + notify |
| Routing | `proxy.ts` | `/fund` in `PUBLIC_ROUTES`; `/api/fund` in `shouldSkipProxy` |
| UI | `src/app/(public)/fund/page.tsx`, `actions.ts` | Form + server action |
| UI | `src/app/(public)/fund/return/page.tsx`, `FunderTopUpStatus.tsx` | Return/status UX |
| API | `src/app/api/fund/topups/status/route.ts`, `reconcile/route.ts` | Public, capability-bound |
| Feed | `src/lib/payments/walletMobile.ts` | "From <name>" title; exclude funder pending |
| Email | `src/lib/email/templates.ts`, `funder-topup.ts`, `docs/emails/*` | Student notification + preview |
| Tests | `src/test/funder-topups.test.ts`, `proxy.test.ts`, email template tests | As §6.8 |
| Docs | `README.md` (both repos), ops/risks doc | As §6.9 |

---

## 10. Deviations from this handoff (as implemented)

Recorded after implementation. Everything not listed here was built as specified in §6.

### Scope and documentation

1. **Mobile app change was needed (§6.6 was wrong).** The app did not use `item.title` for top-ups: `paymentTitle` in `unify-student-wallet/src/features/wallet/unifiedActivity.ts` hard-coded "Wallet top-up". The portal now also sends an explicit optional `funderName` on completed funder top-ups in the activity feed (the "From <name>" title is unchanged). On the app branch `feat/funder-topup-activity`, those items show as "From <name>" with the subtitle "Sent to your wallet". Older app builds ignore the new field.
2. **No README changes in either repo (§6.9).** By decision, `README.md` in the portal and the wallet README are unchanged. The `/fund` notes went into `docs/payment-wallet-development-setup.md` and `docs/system/OPERATIONS_RISKS_AND_NEXT_STEPS.md` instead.
3. **Surname guessing is not rate limited** (decision: document, don't build). The DB-backed limits count only created attempts, and a failed lookup creates none, so someone who knows a student number can try surnames without limit. This is recorded as a known PoC limitation in `OPERATIONS_RISKS_AND_NEXT_STEPS.md`.
4. **Missing `PAYMENT_OTP_PEPPER` fails closed.** Hashing and the OTP bypass are unchanged. Without the pepper (possible only with the dev OTP bypass), `/fund` shows "Funding is currently unavailable", even when the request has no IP. This is noted in the dev setup doc.
5. **Client IP** is the first `x-forwarded-for` hop, as in the activation route. It is trustworthy only behind a proxy that overwrites the header (Vercel); on localhost there is no header, so the per-IP limit is skipped. This is noted in the ops/risks doc.
6. **Email preview README:** its count was already wrong before this work. It now says `index.html` previews eleven emails and that the three vendor-wallet emails have no previews; a "Later additions" note covers the new email.

### Behaviour and ordering (§6.3–§6.5)

7. **Order in `createFunderTopup`:** per-IP limit → student lookup and surname check → university wallet check → `ensureStudentWalletAccount` → Phase A. Checking the university first means a disabled wallet never gains accounts on demand (Phase A still re-checks it). The **per-student limit runs inside Phase A's serializable transaction**, so concurrent funders can't both get under it.
8. **The student number is upper-cased** (and trimmed) before lookup, matching student activation's `normalizeStudentNumber`. The form field also shows capitals.
9. **Idempotency reuse also requires the same `funderName`**, not only the same origin kind and funder email.
10. **A non-numeric amount** shows the out-of-range message instead of the generic one.
11. **Funder-name hardening:** besides C0/C1 control characters, bidi embedding/override/isolate characters (U+202A–U+202E, U+2066–U+2069) are stripped, because they could reorder how the name displays in the app. Whitespace is collapsed, and length is counted in code points.
12. **`?fundError=` carries a fixed key** (`not_eligible`, `amount`, `rate_limited`, `unavailable`, `failed`), never message text, so a crafted `/fund` link can't put arbitrary words on the public page. The messages are the §6.4 table.
13. **Unexpected errors in the server action** are logged by error name and code only, never the message, because provider or database messages could echo submitted details.
14. **Public routes:** status and reconcile each have their own in-memory rate-limit key (`fund-topup-status:` / `fund-topup-reconcile:`), so polling plus one manual check can't exhaust a shared budget. They use a funder-specific error responder (`src/lib/payments/funderApi.ts`) instead of `walletErrorResponse`, which passes domain messages through. It returns only fixed messages: 400 invalid, 403 cross-origin, 404 "Payment not found.", 429, and 503 for anything else.
15. **Return page:** Paystack appends its own `reference` (and `trxref`) to the callback URL, so `reference` arrives twice with the same value; the first is used.
16. **Branding** uses `getDocumentSignedUrlForRender(profile.logoPath)`, as the admin layout does. No public page showed the logo before.
17. **`randToMinor`** moved to `src/lib/formatters` with no behaviour change. The separate copy in `src/features/vendors/RefundPaymentDialog.tsx` is untouched (vendor flow, §7).

### Email (§6.7)

18. **The inbox preview line is fixed text** ("Someone sent funds to your UNIFY wallet for campus spending."), not the funder's name. That keeps untrusted text out of the preview and within the existing 90-character preview check.
19. **The dev-console logger prints the email body**, unlike the vendor-wallet logger, so the email can be checked during the §8 demo.

### UI changes after manual testing

20. The form's button says **"Pay"** and shows a spinner with "Redirecting to Paystack…" (disabled) until checkout opens. The form uses a **two-column layout** (one column on phones), with shorter "Your name" / "Your email" labels. Success reads **"Payment successful"** / "You sent R… to the student's wallet. Thank you." and has a **"Fund another student"** button. "Try again" on failure is also a button.
21. **The delay after a successful payment** before returning to `/fund/return` is Paystack's own success screen, which we don't control. Accepted as is.

### Verification notes

22. Tests added beyond §6.8: the public routes (cross-origin, no-store, generic 404/400/503, per-route rate limits), the form error keys, funder-name sanitising, and a PostgreSQL happy path (`src/test-integration/funder-topups-postgres.test.ts`): a student with no wallet, two concurrent webhook reconciles, one credit and one email, and "From <name>" in Activity.
23. **The webhook path was not exercised end to end locally.** Paystack's dashboard rejected the tunnel URL. The route itself is unchanged, and the cron and the integration test cover the same reconcile function. The per-IP limit can only be observed behind a proxy, e.g. on Vercel.
