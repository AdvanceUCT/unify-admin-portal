# Payment Wallet — Codebase-Adapted Implementation Handoff

## 1. Purpose and status

This document defines the implementation strategy for adding a student payment wallet to the existing UNIFY Admin and Vendor Portal codebase.

It supersedes the generic implementation assumptions in `docs/payment-wallet-handoff.md` where those assumptions do not match this repository. The original product constraints remain useful, but this document is the codebase-specific technical handoff.

The immediate implementation target is deliberately narrow:

> Add a correct, durable wallet-ledger schema, its database invariants, a fast balance projection, and a server-only posting boundary.

Gateway integration, wallet UI, production OTP delivery, payouts, realtime updates, and verification billing are later phases. The schema must nevertheless leave a clear path to those features without requiring the financial ledger to be redesigned.

This is a technical design, not legal, banking, tax, or regulatory advice. Before real funds are accepted, the selected payment provider and the university should confirm the custodial, settlement, refund, chargeback, KYC/KYB, and reconciliation obligations.

---

## 2. Confirmed product and architecture decisions

The following decisions are settled for the current design:

1. Each deployment and database represents one university. Multi-university tenancy inside a shared database is not a current requirement.
2. Payments are restricted to approved on-campus vendor branches.
3. A vendor must first have its existing UNIFY vendor application approved before any of its branches can apply for payment acceptance.
4. Payment acceptance is approved per branch. Most vendors will have one payment-enabled branch, but the model must support several.
5. Each approved branch receives its own static payment QR identifier.
6. A vendor has one organisation-level wallet account and one payout destination shared by all its payment-enabled branches.
7. Spend transactions credit the vendor-level account and record the branch at which the payment occurred.
8. A student has one available wallet balance. There are no separate funding buckets or purses in v1.
9. The initial currency is ZAR. Monetary amounts are stored as integer cents, never floating-point values.
10. Ordinary vendor refunds are intended to correct immediate payment-entry mistakes and are allowed for 10 minutes after a spend completes.
11. Funds from a spend must not become payout-eligible before its refund window closes.
12. Administrators cannot directly alter wallet balances. Corrections must use a future explicit reversal or chargeback operation linked to its originating transaction.
13. Credential and payment functionality remain separate. Payment activation does not require a credential and must not reuse credential proof or DIDComm as payment authentication.
14. The wallet app will use authenticated Next.js API routes for reads and writes. Direct Supabase table reads and Row Level Security are not required for the initial implementation.
15. A stored balance projection is allowed for performance, but the immutable ledger remains the authoritative financial history.

---

## 3. Existing codebase baseline

The implementation must fit the following existing architecture:

- Next.js App Router route handlers and server actions provide application boundaries.
- Prisma is the primary PostgreSQL access layer.
- `DATABASE_URL` is used by the pooled runtime Prisma client.
- `DIRECT_URL` is used by Prisma migrations.
- Supabase's client SDK is currently used with a service-role key for private object storage, not for end-user database authorization.
- Better Auth provides cookie-based administrator and vendor sessions.
- Students are database records, not Better Auth users, and currently have no application session.
- `VendorProfile` represents a vendor organisation.
- `VendorBranch` represents a vendor location/service point.
- `VendorApplication` approval currently grants access to the credential-verification domain.
- Vendor owners and staff are scoped through `VendorMembership` and `VendorBranchMembership`.
- The repository already uses serializable Prisma transactions with retry handling for contentious vendor-application state changes.
- Existing live vendor screens use polling rather than Supabase Realtime.
- There is no current scheduled-job framework or Vercel cron configuration.

### 3.1 Important routing issue

The root `proxy.ts` currently exempts only Better Auth routes and static files before redirecting requests without a Better Auth session cookie. As written, this is incompatible with:

- wallet bearer-token APIs;
- payment-gateway webhooks;
- existing vendor API-key routes; and
- the existing signed agent webhook.

Before adding externally called wallet or webhook routes, the proxy must explicitly allow narrowly selected API prefixes to reach their handlers. Each allowed handler must then perform its own authoritative bearer-token, API-key, internal-secret, or webhook-signature authentication.

Do not broadly exempt all `/api` routes. Use an explicit allowlist and add proxy tests for every non-cookie authentication boundary.

### 3.2 Existing credential activation is not payment authentication

The current mock wallet activation compatibility route forwards credential activation to the agent and synthesizes a `studentId` from an `activationId`. That value is not a verified foreign key to `Student.id`.

The payment wallet must therefore receive a new activation/session flow tied directly to the existing student record. The current credential route, DIDComm connection, credential issuance, and Askar keys must not be treated as proof of payment-wallet identity.

---

## 4. Domain boundaries

### 4.1 Payment ledger domain

Owns:

- wallet accounts;
- immutable ledger entries;
- financial transactions;
- projected balances;
- top-ups;
- spends;
- refunds;
- payouts;
- provider event deduplication; and
- financial reconciliation.

### 4.2 Vendor payment-acceptance domain

Owns:

- vendor-level payment profile;
- one vendor payout destination;
- branch payment applications;
- branch payment approvals and suspensions;
- branch QR identifiers; and
- authorization of vendor users to view or refund branch transactions.

### 4.3 Student payment identity domain

Owns:

- student payment-wallet activation challenges;
- OTP verification;
- wallet access and refresh sessions;
- session revocation; and
- mapping an authenticated wallet session to exactly one `Student.id`.

It does not own or depend on credentials, DIDs, DIDComm connections, proof exchanges, or credential activation.

### 4.4 Vendor verification billing domain

Verification billing is separate from the stored-value payment wallet. It may reuse payment-provider configuration later, but it must use separate usage, invoice, and payment records. Vendor verification fees must never be represented as student-wallet ledger transactions.

---

## 5. Accounting model

### 5.1 Monetary representation

All amounts are stored in minor units:

```text
R10.50 = 1050 amountMinor
```

Use PostgreSQL `BIGINT` and Prisma `BigInt`. Never use JavaScript floating-point arithmetic for money. API boundaries should accept a decimal string or integer minor-unit value and normalize it exactly once. API responses should serialize `BigInt` amounts as strings or safe validated integers; raw JavaScript `bigint` values cannot be JSON serialized directly.

Every account, transaction, entry, payout, and provider event that carries money must include or unambiguously inherit an ISO currency code. V1 supports only `ZAR`, but storing currency explicitly prevents accidental cross-currency posting later.

### 5.2 Balance convention

For student and vendor liability accounts:

```text
balance = total credits - total debits
```

Normal postings are:

| Operation | Debit | Credit |
|---|---|---|
| Successful top-up | Gateway clearing account | Student account |
| Spend | Student account | Vendor account |
| Refund | Vendor account | Student account |
| Successful payout | Vendor account | Gateway payout clearing account |

System clearing accounts may legitimately carry negative signed balances. Student accounts must never be allowed to go below zero. Whether vendor accounts may go below zero is a separate policy; v1 should reject an ordinary refund if the vendor has insufficient funds.

### 5.3 Double-entry invariant

A financial transaction has two or more ledger entries and must satisfy:

```text
sum(debit entry amounts) = sum(credit entry amounts)
```

Although current v1 flows normally create exactly two entries, the schema should permit more than two. This avoids a future migration when fees, reserves, split settlements, or other balanced postings are introduced.

### 5.4 Ledger source of truth and balance projection

`LedgerEntry` is the authoritative, append-only history. Balance reads must not sum the full lifetime ledger on every request.

`WalletAccountBalance` stores a fast, rebuildable projection:

```text
WalletAccountBalance.postedBalanceMinor
  = credits for account - debits for account
```

The balance projection and ledger entries must be changed in the same PostgreSQL transaction. The projection must not have a general-purpose update repository or public mutation endpoint.

The projection provides:

- O(1) balance reads;
- a row to lock during concurrent debits;
- a version useful for debugging and optimistic UI refresh; and
- a compact realtime or polling target later.

The ledger provides:

- financial history;
- auditability;
- correction through reversals rather than edits;
- reconstruction of every balance; and
- detection and repair of projection drift.

---

## 6. Proposed Prisma data model

The following is the intended model shape. Relation names may be adjusted during implementation to satisfy generated Prisma naming, but the cardinality and ownership rules should remain intact.

### 6.1 Enums

```prisma
enum WalletAccountType {
  STUDENT
  VENDOR
  SYSTEM
}

enum WalletAccountStatus {
  ACTIVE
  SUSPENDED
  CLOSED
}

enum WalletTransactionType {
  TOPUP
  SPEND
  REFUND
  PAYOUT
}

enum WalletTransactionStatus {
  PENDING
  COMPLETED
  FAILED
}

enum LedgerDirection {
  DEBIT
  CREDIT
}

enum VendorPaymentProfileStatus {
  PENDING
  APPROVED
  SUSPENDED
  CLOSED
}

enum BranchPaymentApplicationStatus {
  DRAFT
  PENDING
  APPROVED
  REJECTED
  WITHDRAWN
}

enum BranchPaymentAcceptanceStatus {
  ACTIVE
  SUSPENDED
  CLOSED
}

enum PayoutBatchStatus {
  PENDING
  PROCESSING
  COMPLETED
  FAILED
  REQUIRES_RECONCILIATION
}

enum PayoutInitiationSource {
  SCHEDULED
  MANUAL
}
```

### 6.2 University configuration

```prisma
model UniversityProfile {
  // Existing university profile fields omitted.
  paymentsEnabled               Boolean @default(false)
  paymentRefundWindowSeconds    Int     @default(600)
  paymentSettlementDelaySeconds Int     @default(600)
}
```

Rules:

- A missing university profile or `paymentsEnabled = false` means payments are disabled.
- `paymentSettlementDelaySeconds` must be greater than or equal to `paymentRefundWindowSeconds`.
- Enabling payments is restricted to a suitably privileged admin action.
- The deployment is dedicated to one university, so a separate one-to-one payment-settings table adds no current value.
- Provider configuration and secrets must be stored separately so the public feature flag can be read without loading sensitive configuration.

### 6.3 Wallet account and balance projection

```prisma
model WalletAccount {
  id              String              @id @default(cuid())
  type            WalletAccountType
  status          WalletAccountStatus @default(ACTIVE)
  currency        String              @default("ZAR")
  studentId       String?             @unique
  vendorProfileId String?             @unique
  systemCode      String?             @unique
  createdAt       DateTime            @default(now())
  closedAt        DateTime?

  student       Student?             @relation(fields: [studentId], references: [id], onDelete: Restrict)
  vendorProfile VendorProfile?       @relation(fields: [vendorProfileId], references: [id], onDelete: Restrict)
  balance       WalletAccountBalance?
  entries       LedgerEntry[]

  @@index([type, status])
  @@map("wallet_account")
}

model WalletAccountBalance {
  accountId          String   @id
  postedBalanceMinor BigInt   @default(0)
  version            BigInt   @default(0)
  updatedAt          DateTime @updatedAt

  account WalletAccount @relation(fields: [accountId], references: [id], onDelete: Restrict)

  @@map("wallet_account_balance")
}
```

Required SQL check constraint on `wallet_account`:

- `STUDENT`: `studentId` is non-null; `vendorProfileId` and `systemCode` are null.
- `VENDOR`: `vendorProfileId` is non-null; `studentId` and `systemCode` are null.
- `SYSTEM`: `systemCode` is non-null; `studentId` and `vendorProfileId` are null.

Create the balance projection row in the same transaction that creates an account. Provisioning must be idempotent: one active logical account per student and one per vendor profile.

Initial system accounts:

- `GATEWAY_CLEARING`
- `PAYOUT_CLEARING`

System-account creation should be an explicit idempotent bootstrap operation after the migration is applied. These two accounts aggregate the external side of postings; they do not replace transaction-level attribution. Every clearing-account entry remains linked through its `WalletTransaction` to the affected student/vendor account, provider identifiers, gateway events, and payout batch as applicable.

### 6.4 Financial transaction

```prisma
model WalletTransaction {
  id                   String                  @id @default(cuid())
  type                 WalletTransactionType
  status               WalletTransactionStatus
  amountMinor          BigInt
  currency             String                  @default("ZAR")
  initiatorAccountId   String?
  initiatedByUserId    String?
  vendorBranchId       String?
  linkedTransactionId  String?
  idempotencyKey       String?
  reference            String?
  paymentProvider      String?
  providerPaymentId    String?
  providerPayerReference String?
  refundableUntil      DateTime?
  availableForPayoutAt DateTime?
  completedAt          DateTime?
  failedAt             DateTime?
  failureCode          String?
  createdAt            DateTime                @default(now())

  vendorBranch VendorBranch? @relation(fields: [vendorBranchId], references: [id], onDelete: Restrict)
  entries      LedgerEntry[]

  @@index([type, status, createdAt])
  @@index([vendorBranchId, createdAt])
  @@index([linkedTransactionId])
  @@index([initiatedByUserId, createdAt])
  @@map("wallet_transaction")
}
```

Implementation notes:

- `initiatorAccountId` identifies the account in whose idempotency namespace the client request was made. Add the appropriate relation or retain it as a restricted foreign key depending on the final Prisma relation layout.
- `initiatedByUserId` separately records a Better Auth administrator or vendor user when one manually initiated the operation. Student actions remain attributable through their student wallet account because students are not Better Auth `User` records.
- A top-up stores an immutable `paymentProvider` and `providerPaymentId`. `providerPayerReference` is optional and may contain only a safe, non-card provider customer/payer reference.
- `linkedTransactionId` is a self-reference. For v1 it is required for `REFUND` and absent for ordinary spends and top-ups.
- `vendorBranchId` is required for `SPEND` and inherited from the original spend for `REFUND`.
- `amountMinor` is the user-facing transaction amount. The ledger-entry sum is authoritative if a future transaction has more than two legs.
- `refundableUntil` and `availableForPayoutAt` are captured when the spend completes. Configuration changes do not retroactively alter existing transactions.
- A pending top-up has no entries. It becomes completed only when a verified gateway event atomically posts its entries.
- A completed or failed transaction is terminal. There is no generic administrative adjustment. Any future correction must use an explicit linked reversal or chargeback transaction type with a defined real-world cause.

Use a SQL partial unique index for non-null client idempotency keys:

```sql
CREATE UNIQUE INDEX wallet_transaction_idempotency_key
ON wallet_transaction ("initiatorAccountId", type, "idempotencyKey")
WHERE "idempotencyKey" IS NOT NULL;
```

The exact quoted enum/type syntax should be checked against the SQL generated by the final Prisma migration.

### 6.5 Immutable ledger entries

```prisma
model LedgerEntry {
  id                  String          @id @default(cuid())
  walletTransactionId String
  accountId           String
  sequence            Int
  direction           LedgerDirection
  amountMinor         BigInt
  currency            String
  createdAt           DateTime        @default(now())

  walletTransaction WalletTransaction @relation(fields: [walletTransactionId], references: [id], onDelete: Restrict)
  account           WalletAccount     @relation(fields: [accountId], references: [id], onDelete: Restrict)

  @@unique([walletTransactionId, sequence])
  @@index([accountId, createdAt, id])
  @@map("ledger_entry")
}
```

Database rules:

- `amountMinor > 0`.
- Entry currency must equal transaction currency and account currency.
- `UPDATE` and `DELETE` are rejected by a database trigger.
- A completed transaction has at least two entries.
- Completed-transaction debit and credit totals are equal.
- Entries cannot be attached to a terminal transaction after it is committed.

A deferred constraint trigger is preferable for the balanced-transaction check because an individual entry is temporarily unbalanced while the other entries are being inserted in the same database transaction.

### 6.6 Vendor payment profile

```prisma
model VendorPaymentProfile {
  id                         String                     @id @default(cuid())
  vendorProfileId            String                     @unique
  status                     VendorPaymentProfileStatus @default(PENDING)
  payoutProvider             String?
  payoutDestinationReference String?
  payoutDestinationCiphertext String?
  approvedAt                 DateTime?
  approvedByUserId           String?
  suspendedAt                DateTime?
  suspensionReason           String?
  createdAt                  DateTime                   @default(now())
  updatedAt                  DateTime                   @updatedAt

  vendorProfile VendorProfile @relation(fields: [vendorProfileId], references: [id], onDelete: Restrict)

  @@index([status])
  @@map("vendor_payment_profile")
}
```

Only provider-issued tokens or references may be stored. Raw bank-account details must not be persisted. Sensitive reusable provider material should be encrypted with a payment-specific, versioned encryption key or a managed secrets/KMS facility.

The vendor-level `WalletAccount` is associated through its unique `vendorProfileId`. This avoids storing the same account ownership twice.

### 6.7 Branch payment application and acceptance

Application history and active capability are intentionally separated.

```prisma
model VendorBranchPaymentApplication {
  id               String                         @id @default(cuid())
  vendorBranchId   String
  status           BranchPaymentApplicationStatus @default(DRAFT)
  submittedAt      DateTime?
  reviewedAt       DateTime?
  reviewedByUserId String?
  reviewNotes      String?
  withdrawnAt      DateTime?
  createdAt        DateTime                       @default(now())
  updatedAt        DateTime                       @updatedAt

  vendorBranch VendorBranch @relation(fields: [vendorBranchId], references: [id], onDelete: Restrict)

  @@index([vendorBranchId, createdAt])
  @@index([status])
  @@map("vendor_branch_payment_application")
}

model VendorBranchPaymentAcceptance {
  id                    String                        @id @default(cuid())
  vendorBranchId        String                        @unique
  approvedApplicationId String                        @unique
  status                BranchPaymentAcceptanceStatus @default(ACTIVE)
  qrIdentifier          String                        @unique
  approvedAt            DateTime
  suspendedAt           DateTime?
  suspensionReason      String?
  createdAt             DateTime                      @default(now())
  updatedAt             DateTime                      @updatedAt

  vendorBranch VendorBranch @relation(fields: [vendorBranchId], references: [id], onDelete: Restrict)

  @@index([status])
  @@map("vendor_branch_payment_acceptance")
}
```

Add a partial unique index to permit application history while allowing no more than one active `DRAFT`, `PENDING`, or `APPROVED` branch payment application at once.

Approval requirements:

- The parent vendor has a current `VendorApplication` with status `APPROVED`.
- The branch belongs to that vendor and is active.
- The vendor has completed its vendor-level payment and payout setup.
- Approval creates the vendor wallet account if absent.
- Approval creates or reactivates branch payment acceptance.
- QR identifiers are generated server-side using cryptographically secure randomness.

If the parent vendor application is revoked, all branch payment acceptances should be suspended in the same business operation. Existing funds remain refundable and payable according to policy, but no new spends may be accepted.

### 6.8 Gateway event deduplication

```prisma
model PaymentGatewayEvent {
  id                  String   @id @default(cuid())
  provider            String
  externalEventId     String
  eventType           String
  payloadHash         String
  walletTransactionId String?
  receivedAt          DateTime @default(now())
  processedAt         DateTime?
  processingError     String?

  @@unique([provider, externalEventId])
  @@index([walletTransactionId])
  @@map("payment_gateway_event")
}
```

Store only the provider data required for audit, correlation, and safe replay. Avoid retaining unnecessary cardholder or banking data. Signature verification must use the exact raw request body when required by the selected provider.

### 6.9 Payout batches

Payout tables may be added after spend/refund behavior is stable, but the intended model is:

```prisma
model PayoutBatch {
  id                     String            @id @default(cuid())
  vendorPaymentProfileId String
  status                 PayoutBatchStatus @default(PENDING)
  amountMinor            BigInt
  currency               String            @default("ZAR")
  cutoffAt               DateTime
  provider               String
  providerIdempotencyKey String            @unique
  providerPayoutId       String?
  payoutDestinationReference String
  initiationSource       PayoutInitiationSource @default(SCHEDULED)
  initiatedByUserId      String?
  payoutTransactionId    String?            @unique
  attemptCount           Int                @default(0)
  lastAttemptAt          DateTime?
  completedAt            DateTime?
  failureCode            String?
  createdAt              DateTime           @default(now())
  updatedAt              DateTime           @updatedAt

  @@index([vendorPaymentProfileId, status])
  @@map("payout_batch")
}
```

`payoutDestinationReference` is an immutable safe snapshot of the destination used for that batch; it must not contain raw bank credentials. `initiationSource = MANUAL` requires `initiatedByUserId`. Provider and ledger references may be attached once during processing but cannot later be replaced.

Pending or processing payout batches reserve their amount so concurrent jobs cannot schedule it twice. A provider timeout after submission is an unknown outcome, not an automatic failure: query the provider with the idempotency key before retrying.

---

## 7. Posting boundary and concurrency

All money-moving operations must use one server-only posting boundary. No route handler, server action, background job, or client may insert ledger entries directly.

Suggested module layout:

```text
src/lib/payments/
  accounts.ts
  balance.ts
  ledger.ts
  posting.ts
  errors.ts
  types.ts
```

The initial implementation can use a Prisma interactive transaction plus parameterized raw SQL for row locks, following the repository's existing serializable retry pattern. Before real-money launch, use a dedicated PostgreSQL posting function and least-privileged runtime database permissions if feasible.

### 7.1 Posting algorithm

For a spend or refund:

1. Validate request shape before opening the database transaction.
2. Begin a transaction with `Serializable` isolation.
3. Resolve an existing transaction with the same scoped idempotency key. If found, return its result without reposting.
4. Lock all participating `WalletAccountBalance` rows with `SELECT ... FOR UPDATE`, sorted by account ID to reduce deadlock risk.
5. Reload and validate account status, university payment enablement, vendor approval, branch approval, and currency inside the transaction.
6. Recalculate any refund aggregate or payout reservation required by the operation.
7. Validate sufficient funds using the locked projected balance.
8. Insert the `WalletTransaction`.
9. Insert all `LedgerEntry` rows.
10. Update or trigger updates to each `WalletAccountBalance` row and increment its version.
11. Verify the entries balance.
12. Mark the transaction completed where a status transition is required.
13. Commit.
14. Retry recognized serialization failures a bounded number of times.

Do not perform payment-provider network calls while holding database row locks. Use a prepare/call/finalize pattern for gateway operations.

### 7.2 Balance projection updates

There are two viable implementations:

1. A database trigger updates `WalletAccountBalance` after every ledger insert.
2. The posting function explicitly updates the balance rows.

The database-trigger option gives stronger protection against accidental projection drift from an unexpected insert path. Whichever option is chosen, tests must prove that ledger entries and projections cannot commit independently.

### 7.3 Idempotency

Idempotency has separate namespaces:

- Student-generated spend/refund request keys.
- Top-up creation request keys.
- Gateway event IDs.
- Gateway checkout/payment references.
- Payout provider idempotency keys.

An idempotent retry returns the existing logical result. It must not create a second transaction, second ledger posting, or second provider action.

---

## 8. Core operation rules

### 8.1 Wallet-account provisioning

- Student wallet accounts are created only after successful independent payment-wallet activation.
- Vendor wallet accounts are created on first successful branch payment approval or during vendor-level payment setup.
- Account creation and zero-balance projection creation are atomic and idempotent.
- A closed account is never reopened; future policy should create a successor account if reopening is required.

### 8.2 Top-up

Later gateway flow:

1. Authenticated student requests a checkout with a client idempotency key.
2. Server creates an idempotent provider checkout and persists a pending top-up with the provider name and immutable provider payment ID. A retry must reconcile either side if one creation succeeded before the other.
3. Gateway sends a signed webhook.
4. The raw signature is verified before parsing or processing the event.
5. The provider event ID is inserted idempotently.
6. A successful event posts gateway-clearing debit and student credit, updates the student projection, and completes the transaction atomically.
7. Duplicate or out-of-order events return success without duplicate posting.
8. Pending transactions are later reconciled against provider state.

The student never receives spendable balance from a client-reported checkout result.

### 8.3 Vendor lookup and static branch QR

QR payload:

```text
unifywallet://pay/{opaqueBranchQrIdentifier}
```

It contains:

- no amount;
- no vendor or branch display name;
- no student data;
- no reusable secret; and
- no credential-verification request.

The wallet calls the server to resolve the identifier. The server returns the current registered vendor and branch names, logo when available, and whether that branch may currently accept payment.

This prevents a forged QR payload from controlling confirmation-screen text. It does not eliminate physical sticker swapping, so the confirmation screen must prominently display both organisation and branch names.

### 8.4 Spend

A spend must verify, inside the posting transaction:

- university payments are enabled;
- the authenticated student account is active;
- the parent vendor application is currently approved;
- the vendor payment profile is approved;
- the vendor account is active;
- the branch belongs to the vendor and remains active;
- the branch payment acceptance is active;
- the amount is within configured bounds;
- currency is ZAR;
- the idempotency key has not already posted another spend; and
- the student has sufficient locked projected balance.

The spend credits the vendor organisation account and stores `vendorBranchId` for reporting and authorization.

### 8.5 Ten-minute refund

When a spend completes:

```text
refundableUntil      = completedAt + 600 seconds
availableForPayoutAt = max(refundableUntil, completedAt + paymentSettlementDelaySeconds)
```

The configured values are copied onto the spend so later configuration changes do not affect existing transactions.

A refund must verify atomically:

- original transaction exists and is a completed spend;
- current server time is not after `refundableUntil`;
- requesting vendor user has access to the original branch;
- branch and vendor match the original spend;
- requested amount is positive;
- completed prior refunds plus the new refund do not exceed the original amount;
- vendor account has sufficient funds; and
- the refund request is idempotent.

Refund posting:

```text
Debit  vendor organisation account
Credit student account
```

Partial refunds are allowed within the same aggregate limit. A second ordinary spend handles underpayment.

The ten-minute vendor refund is not a gateway chargeback or top-up reversal. Those events may arrive much later and require explicit provider-reversal or chargeback transaction types designed around the chosen gateway.

### 8.6 Exceptional corrections

V1 has no generic administrative adjustment transaction or balance-editing endpoint. Neither `ADMIN` nor `SUPER_ADMIN` can manufacture or erase wallet value.

If an operational correction becomes necessary later, introduce a narrowly named transaction type such as `CHARGEBACK` or `REVERSAL`. It must:

- link to the originating financial transaction;
- correspond to a documented real-world event;
- record the authenticated actor or provider event;
- include an incident or case reference;
- be idempotent and balanced; and
- create new immutable entries rather than changing historical entries or a projected balance directly.

### 8.7 Payout

One payout destination belongs to the vendor organisation and aggregates every approved payment branch.

The payable calculation must not use `credits - debits - already paid` if payout debits are already in the ledger; that would double-subtract payouts. At a locked cutoff, calculate:

```text
vendor posted balance
- funds whose availableForPayoutAt is after cutoff
- amounts reserved by pending/processing payout batches
= amount available for a new payout batch
```

On confirmed provider success, post vendor debit and payout-clearing credit, then complete the batch atomically. Branch-level payout reporting is derived from source spend/refund transactions even though the payout destination and ledger account are vendor-level.

---

## 9. Student payment activation and sessions

This is not part of the first ledger migration, but the intended authentication boundary must be clear before wallet APIs are exposed.

Recommended activation:

1. Student enters their student number.
2. Server locates the student without revealing whether an arbitrary record exists.
3. Server sends an OTP only to the email already stored in the university student record.
4. Response is generic and may display only a masked destination.
5. OTP verification resolves exactly one `Student.id`.
6. Server provisions the student wallet account idempotently.
7. Server issues payment-specific access and refresh sessions.

Security requirements:

- hashed OTPs and refresh tokens at rest;
- short OTP expiry;
- single-use challenges;
- attempt limits;
- resend cooldowns;
- per-student, per-IP, and device-aware rate limiting;
- refresh-token rotation and reuse detection;
- session revocation;
- generic anti-enumeration responses;
- secure mobile OS token storage; and
- isolation from credential wallet keys and records.

The payment session authenticates API access. It is not proof that the student possesses a credential.

---

## 10. API surface adapted to Next.js

Use explicit versioned API routes.

### Student wallet

```text
POST /api/wallet/v1/activations/request
POST /api/wallet/v1/activations/verify
POST /api/wallet/v1/sessions/refresh
POST /api/wallet/v1/sessions/revoke
GET  /api/wallet/v1/balance
GET  /api/wallet/v1/transactions
POST /api/wallet/v1/topups
GET  /api/wallet/v1/vendors/{qrIdentifier}
POST /api/wallet/v1/payments
```

### Vendor portal

```text
POST /api/vendor/payment-profile
GET  /api/vendor/payment-branches
POST /api/vendor/branches/{branchId}/payment-applications
GET  /api/vendor/transactions
POST /api/vendor/payments/{transactionId}/refund
GET  /api/vendor/payouts
```

Vendor portal routes continue using the existing Better Auth session plus vendor/branch context. Owners may see all branches. Staff may see and refund only transactions belonging to assigned active branches.

### Admin portal

```text
GET  /api/admin/payment-applications
POST /api/admin/payment-applications/{applicationId}/decision
GET  /api/admin/payment-settings
POST /api/admin/payment-settings
GET  /api/admin/payment-reconciliation
```

### Provider and internal boundaries

```text
POST /api/webhooks/payments/{provider}
POST /api/internal/payments/payouts/run
POST /api/internal/payments/topups/reconcile
POST /api/internal/payments/ledger/reconcile
```

Internal job routes require a dedicated internal secret or platform-authenticated scheduler identity. They must not rely on a browser cookie.

API responses should use a consistent error envelope, request/correlation IDs, and stable machine-readable payment error codes such as:

- `PAYMENTS_DISABLED`
- `WALLET_SESSION_INVALID`
- `ACCOUNT_SUSPENDED`
- `BRANCH_NOT_PAYMENT_ENABLED`
- `INSUFFICIENT_FUNDS`
- `REFUND_WINDOW_EXPIRED`
- `REFUND_AMOUNT_EXCEEDED`
- `IDEMPOTENCY_CONFLICT`
- `GATEWAY_EVENT_INVALID`

---

## 11. Authorization rules

### Student

- May read only their own balance and transactions.
- May initiate a top-up only for their own account.
- May spend only from their own account.
- Cannot create ledger entries, refunds, payouts, or vendor approval records.

### Vendor owner

- May manage vendor-level payout onboarding.
- May apply for payment acceptance for any branch belonging to the vendor.
- May view transactions for all vendor branches.
- May refund eligible transactions for all vendor branches.

### Vendor staff

- May view transactions only for assigned active branches.
- May refund only eligible transactions for assigned active branches, if product policy grants staff refund permission.
- Cannot change the payout destination or apply for new branch payment capabilities unless explicitly authorized later.

### Admin roles

- `SUPER_ADMIN` and `ADMIN` may review branch payment applications if added to the payment permission map.
- Only `SUPER_ADMIN` may change sensitive gateway/payout configuration. No admin role may directly edit balances or post a generic adjustment.
- Read-only financial reporting should receive an explicit capability rather than inheriting broad settings access accidentally.

Payment capabilities should be added to `ADMIN_ACTIONS` rather than inferred from unrelated `vendor:write` or `student:write` permissions.

---

## 12. Realtime and offline behavior

### 12.1 Initial approach

Because the wallet uses Next.js APIs and the repository already uses polling, the first version should use:

- immediate API response after a synchronous spend;
- foreground refresh after returning from hosted checkout;
- bounded polling while a top-up remains pending; and
- short-interval vendor polling on the active incoming-payments screen.

Supabase Realtime can be added later if it materially improves the experience. It would require a deliberate token and row-authorization design; the existing service-role storage client is not suitable for end-user subscriptions.

### 12.2 Offline rules

- A spend is never authorized locally.
- The wallet disables the pay action when offline.
- A cached balance may be displayed only with a last-updated timestamp.
- Cached balance is never used to approve a spend.
- Payment requests are not queued for later replay.
- A client timeout after submission is resolved by retrying with the same idempotency key, not by generating a new payment.

---

## 13. Reconciliation and observability

### 13.1 Internal ledger reconciliation

Regularly verify:

- every completed transaction balances;
- every account projection equals signed ledger entries;
- no student account is negative;
- entries reference matching currencies;
- refund totals do not exceed original spends;
- terminal transactions have expected entries; and
- pending/processing payouts do not over-reserve vendor funds.

Projection reconciliation compares:

```text
WalletAccountBalance.postedBalanceMinor
against
SUM(CREDIT ledger entries) - SUM(DEBIT ledger entries)
```

Drift must raise an alert and block unsafe operations. It must not be silently overwritten without retaining an incident record.

### 13.2 External funds reconciliation

Do not sum every account and compare that number with gateway cash: a balanced double-entry ledger sums to zero across all accounts.

Instead compare the relevant student/vendor liabilities and settlement state with:

- gateway collections;
- refunds and reversals;
- completed payouts;
- provider fees handled inside or outside the wallet ledger;
- pending settlement timing; and
- payout batches requiring reconciliation.

The exact formula depends on the chosen gateway's custody and settlement model.

### 13.3 Logging and metrics

Log identifiers and states, not sensitive payment payloads. Useful metrics include:

- posting success/failure count by operation;
- serialization retries;
- idempotent replay count;
- insufficient-funds rejections;
- gateway signature failures;
- pending top-up age;
- refund-window expirations;
- payout unknown outcomes; and
- reconciliation drift.

---

## 14. Testing strategy

### 14.1 Schema and database invariant tests

These must run against PostgreSQL, not only mocked Prisma delegates:

- Account owner check constraint rejects invalid combinations.
- Account creation creates exactly one zero-balance projection.
- Duplicate student or vendor account creation is rejected or idempotently reused.
- Zero and negative entry amounts are rejected.
- Ledger-entry update and delete are rejected.
- Deleting referenced accounts, students, vendors, branches, or transactions is restricted.
- A completed unbalanced transaction cannot commit.
- Entry/account/transaction currency mismatch is rejected.
- Duplicate scoped idempotency keys cannot commit.

### 14.2 Posting tests

- Top-up credits the student once.
- Spend debits student and credits vendor.
- Spend records the correct branch.
- Refund reverses the correct amount.
- Partial refunds cannot exceed the original amount in aggregate.
- Refund after 10 minutes is rejected using server time.
- Refund before 10 minutes succeeds when the vendor has funds.
- Concurrent spends cannot overdraw a student account.
- Concurrent partial refunds cannot exceed the original spend.
- Duplicate requests return the original result without duplicate entries.
- A failed posting leaves transaction, ledger, and projection state unchanged.
- Projection equals ledger after every successful operation.

### 14.3 Authorization and route tests

- Wallet bearer routes reach handlers without a Better Auth cookie.
- Invalid wallet tokens receive JSON `401`, not a redirect.
- Gateway webhooks reach handlers without a browser session.
- Invalid webhook signatures are rejected.
- Vendor staff cannot read or refund transactions outside assigned branches.
- Vendor owner can access all branches belonging to the vendor.
- Unapproved or suspended branches cannot receive spends.
- No administrator can directly edit a projected balance or post a generic adjustment.
- Future reversal or chargeback handlers require explicit authorization and an originating transaction/provider event.

### 14.4 Provider contract tests

Once a gateway is selected:

- raw-body signature fixtures;
- duplicate event handling;
- out-of-order events;
- timeout and unknown payout results;
- provider idempotency behavior;
- amount/currency mismatch rejection; and
- reconciliation lookup behavior.

---

## 15. Recommended implementation sequence

### Phase 0 — Commit the architecture decisions

- Accept this handoff or record amendments.
- Confirm OTP delivery details.
- Confirm refund permissions for vendor staff.
- Confirm minimum/maximum transaction values.
- Confirm student-record retention behavior.

### Phase 1 — Ledger foundation: immediate target

1. Add payment enums and proposed core models to `prisma/schema.prisma`.
2. Add inverse relations to `Student`, `VendorProfile`, `VendorBranch`, and `UniversityProfile`.
3. Generate a named Prisma migration.
4. Hand-edit the migration to add check constraints, partial unique indexes, immutable-ledger triggers, and balanced-transaction enforcement.
5. Add the idempotent `npm run payments:bootstrap` setup command, requiring exactly one university profile and verifying both clearing-account balance projections.
6. Add server-only account and balance repositories.
7. Add the serializable posting boundary and recognized serialization retry behavior.
8. Add PostgreSQL-backed invariant and concurrency tests.
9. Keep `UniversityProfile.paymentsEnabled` false.

The PostgreSQL suite is implemented as `npm run test:payments:db`. It runs separately from ordinary unit tests, verifies the applied migration record on `DIRECT_URL`, and cleans up its disposable test objects after exercising the real triggers and concurrency paths.

No production gateway or user-facing payment feature is enabled in this phase.

### Phase 2 — Vendor payment onboarding

- Vendor-level payout profile.
- Branch applications and admin decisions.
- Payment-specific admin permissions.
- Opaque branch QR creation and server-side lookup.
- Automatic payment suspension when the parent vendor is revoked.

### Phase 3 — Student payment activation and read APIs

- OTP challenge and delivery.
- Payment-specific wallet sessions.
- Proxy allowlist changes.
- Authenticated balance and transaction-history endpoints.
- Wallet account provisioning after successful activation.

### Phase 4 — Gateway configuration and top-up

- Select gateway.
- Provider adapter interface.
- Encrypted configuration.
- Hosted checkout.
- Signed, idempotent webhooks.
- Pending top-up reconciliation.

### Phase 5 — Spend and refund

- Branch QR resolution.
- Student confirmation flow.
- Atomic online spend.
- Vendor incoming-payment feed.
- Ten-minute partial/full refund flow.

### Phase 6 — Payout and reconciliation

- Scheduler/internal job authentication.
- Payout reservations and provider idempotency.
- One payout destination per vendor.
- Internal and external reconciliation dashboards and alerts.

### Phase 7 — Optional realtime improvements

- Evaluate polling performance and UX.
- Add SSE or authorized Supabase Realtime only if justified.
- Treat realtime messages as refresh signals, not as authoritative financial state.

### Phase 8 — Verification billing

- Immutable verification usage event with `rateAtTime`.
- Invoice aggregation and collection.
- Overdue access policy.
- Revenue routing after the commercial decision is confirmed.

---

## 16. Initial ledger-foundation acceptance criteria

The first implementation milestone is complete when:

- Prisma models and committed migrations describe the account, projection, transaction, entry, configuration, vendor payment, and branch payment structures.
- Invalid account ownership cannot be stored.
- Ledger entries cannot be updated or deleted through ordinary runtime access.
- Completed transactions cannot commit unbalanced.
- Student and vendor balance projections update atomically with entries.
- Balance lookup does not scan the full ledger.
- Student accounts cannot be overdrawn by concurrent requests.
- Idempotent retries cannot post twice.
- Spend postings retain the exact vendor branch.
- Refund aggregates cannot exceed the original spend.
- Refund eligibility is captured as a transaction timestamp with a 10-minute default.
- Only the server-only payment domain can post entries.
- PostgreSQL-backed tests cover constraints and concurrency.
- Payments remain disabled by default.

---

## 17. Decisions still open

These decisions do not block the core ledger schema unless noted:

1. Payment gateway and its custody/settlement capabilities.
2. Exact student OTP channel and whether the student must enter both student number and matching email.
3. OTP expiry, rate limits, and payment-session lifetimes.
4. Whether assigned vendor staff may initiate refunds or only vendor owners may do so.
5. Minimum and maximum top-up, spend, and refund amounts.
6. Payout cadence and minimum payout threshold.
7. Whether provider fees are absorbed outside the wallet ledger or represented as additional ledger legs.
8. Operational process for top-up chargebacks and reversals.
9. Whether students with financial history may ever be hard-deleted. Recommended answer: no; retain the referenced row and use status/anonymization policies where legally appropriate.
10. Whether vendor payment acceptance remains automatically suspended for the full duration of parent vendor revocation. Recommended answer: yes.
11. Verification billing revenue destination and any university/platform split.

---

## 18. Implementation cautions

- Do not name the Prisma model simply `Transaction`; use `WalletTransaction`.
- Do not store money in `Float` or JavaScript `number` without strict safe-range checks.
- Do not expose raw Prisma financial records directly as JSON because of `BigInt` serialization and internal identifiers.
- Do not add a client-side insert path for ledger entries.
- Do not treat a cached wallet balance as authorization to spend.
- Do not make provider network calls while account rows are locked.
- Do not retry a payout after an unknown provider outcome without querying provider state.
- Do not reuse verification QR identifiers or `/verify` deep links for payments.
- Do not interpret existing vendor verification approval alone as branch payment approval.
- Do not mutate a historical spend to represent a refund.
- Do not let a current configuration change alter an existing spend's captured refund or settlement timestamps.
- Do not rely only on mocked unit tests for financial constraints and concurrency.
- Do not enable payment UI merely because tables exist; all surfaces must remain behind the fail-closed university configuration flag.

---

## 19. Suggested first code review boundary

The first pull request should be reviewable without discussing gateways or wallet screens. Its title can be:

> Add payment wallet ledger foundation and database invariants

It should contain:

- Prisma schema additions;
- one committed migration with explicit SQL constraints and triggers;
- account/system-account provisioning;
- balance projection logic;
- server-only balanced posting primitive;
- domain error types;
- PostgreSQL-backed financial invariant tests; and
- no enabled routes that move real money.

That boundary delivers immediate implementation progress while preserving a coherent path to activation, branch onboarding, top-ups, spends, refunds, payouts, and reconciliation.
