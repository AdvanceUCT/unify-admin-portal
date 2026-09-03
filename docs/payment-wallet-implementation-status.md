# Payment wallet implementation status

**Status date:** 4 September 2026  
**Current milestone:** Ledger foundation implemented in code; database application and PostgreSQL-backed integration testing remain outstanding.

This document is the concise companion to [Payment wallet implementation handoff](./payment-wallet-implementation-handoff.md). It records what now exists in the repository, what is only represented in the schema, and what should be built next. For setup commands, see [Payment wallet development setup](./payment-wallet-development-setup.md).

## Current position

The repository now has a strong wallet-ledger foundation, but it does not yet expose usable payment functionality to students, vendors, or administrators.

The implemented code provides:

- the wallet and payment-onboarding data model;
- a hand-written PostgreSQL migration with financial invariants;
- immutable double-entry ledger posting;
- stored, transactionally maintained balance projections;
- internal gateway and payout clearing accounts;
- an idempotent development bootstrap; and
- a server-only posting primitive with concurrency and idempotency handling.

The migration has not been applied to the configured database by this implementation work. No real or test funds have been created.

## Important decisions reflected in the code

- Each deployment/database represents one university.
- Payment settings live directly on `UniversityProfile`; there is no separate `UniversityPaymentConfig` table.
- Payments default to disabled.
- V1 supports ZAR only and stores money as integer cents using PostgreSQL `BIGINT` and Prisma `BigInt`.
- Each student has one wallet account and balance.
- Each vendor organisation has one wallet account and payout destination, shared across its approved branches.
- Payment acceptance is approved per vendor branch, and spends retain the exact branch.
- Ordinary vendor refunds have a ten-minute default window.
- Balances cannot be edited directly by an administrator.
- There is no generic administrative adjustment transaction or adjustment clearing account.
- Future corrections must use explicit, balanced reversal or chargeback operations linked to a real originating event.
- `GATEWAY_CLEARING` and `PAYOUT_CLEARING` are internal double-entry counterparts, not user-facing wallets. Transaction, provider, actor, and payout records retain the detailed attribution.

## Implemented foundation

### Prisma schema

The following models now exist in `prisma/schema.prisma`:

- `WalletAccount`
- `WalletAccountBalance`
- `WalletTransaction`
- `LedgerEntry`
- `VendorPaymentProfile`
- `VendorBranchPaymentApplication`
- `VendorBranchPaymentAcceptance`
- `PaymentGatewayEvent`
- `PayoutBatch`

Required inverse relations were added to `Student`, `VendorProfile`, `VendorBranch`, and `User`.

`UniversityProfile` now contains:

```prisma
paymentsEnabled               Boolean @default(false)
paymentRefundWindowSeconds    Int     @default(600)
paymentSettlementDelaySeconds Int     @default(600)
```

These timing values are copied onto completed spends so future setting changes do not retroactively change refund or payout eligibility.

### Ledger and balance behavior

The committed migration creates the wallet tables and enforces the core rules in PostgreSQL:

- wallet accounts have exactly one valid owner shape: student, vendor, or system;
- all current wallet amounts and accounts use ZAR;
- transaction and ledger amounts must be positive;
- a balance projection row is created automatically with every wallet account;
- projection rows cannot be updated or deleted through ordinary application writes;
- ledger entries cannot be updated or deleted;
- entries can only be attached to pending transactions;
- inserting an entry updates its account projection in the same database transaction;
- student and vendor accounts cannot be overdrawn;
- completed transactions require balanced debit and credit totals matching the transaction amount;
- transactions containing entries cannot remain pending when the database transaction commits;
- completed and failed transactions are terminal;
- spends require branch and refund/payout timestamps;
- refunds must reference a completed spend for the same branch, remain inside the refund window, and never exceed the original amount in aggregate; and
- payout attribution and destination snapshots cannot later be replaced.

The immutable ledger remains authoritative. `WalletAccountBalance` is a fast, rebuildable projection, so ordinary balance reads do not aggregate a student's complete transaction history.

### Traceability

Top-up transactions support:

- the credited student wallet through their ledger entry;
- an idempotency-scoping wallet account;
- a separate Better Auth actor when applicable;
- payment provider;
- immutable provider payment ID;
- optional safe provider payer/customer reference; and
- linked, deduplicated gateway events.

Completed top-ups cannot be posted without provider attribution. Raw card or bank credentials are not stored.

Payout batches support:

- vendor payment profile;
- amount, currency, and cutoff;
- payout provider and idempotency key;
- provider payout ID;
- immutable payout-destination reference snapshot;
- scheduled or manual initiation source;
- required initiating `User` for manual payouts; and
- linked payout ledger transaction.

### Server-only payment modules

The following reusable modules exist under `src/lib/payments/`:

- `accounts.ts` — idempotent student, vendor, and clearing-account provisioning;
- `balance.ts` — constant-time projected balance reads;
- `config.ts` — fail-closed reads of university payment settings;
- `constants.ts` — ZAR and clearing-account constants;
- `errors.ts` — stable wallet domain errors;
- `foundation.ts` — transaction-scoped bootstrap and integrity verification; and
- `posting.ts` — the only current application-level balanced posting boundary.

The posting boundary:

- validates balanced requests before opening a database transaction;
- checks `UniversityProfile.paymentsEnabled`;
- uses serializable Prisma transactions with retry handling;
- locks participating balance rows in deterministic order;
- validates account existence, status, currency, and funds;
- provides account-scoped idempotency and conflict detection;
- creates pending transaction and immutable entries atomically;
- completes the transaction only after entries have been written; and
- relies on database triggers as the final invariant and overdraft guard.

This is an internal primitive. No public route currently accepts arbitrary posting instructions.

### Bootstrap tooling

The following commands are available:

```powershell
npm run payments:bootstrap
npm run payments:bootstrap:dev
```

Both commands regenerate the Prisma client, require exactly one university profile, provision the two clearing accounts idempotently, and verify their active status and balance projections in one serializable transaction.

The default command leaves `paymentsEnabled` unchanged. The development command explicitly enables it and refuses to do so when `NODE_ENV=production`.

The bootstrap intentionally does not create student wallets, vendor wallets, transactions, or balances. Those records remain tied to their real activation and approval lifecycles.

## Validation completed

The current implementation has passed:

- Prisma schema validation;
- Prisma client generation;
- Prisma migration rendering from the schema;
- TypeScript type checking;
- ESLint with zero errors and six pre-existing unrelated warnings;
- focused wallet foundation, posting, and migration tests; and
- the complete repository suite: 71 test files and 415 tests.

Current wallet tests verify service behavior and inspect the hand-written migration. They do not yet execute that migration and its triggers against a real PostgreSQL test database.

## Handoff phase status

| Handoff phase | Status | Notes |
|---|---|---|
| Phase 0 — Architecture decisions | Substantially complete | Remaining product/provider decisions are listed below. |
| Phase 1 — Ledger foundation | Code complete; database proof pending | Migration is authored but unapplied here. PostgreSQL-backed invariant and concurrency tests remain required. |
| Phase 2 — Vendor payment onboarding | Schema only | Models exist; application services, authorization, routes, UI, approval side effects, and QR generation are not implemented. |
| Phase 3 — Student activation and reads | Not implemented | No OTP challenge, wallet session, balance API, or history API exists. |
| Phase 4 — Gateway and top-up | Foundation only | Attribution schema and posting rules exist; no provider adapter, checkout, webhook, or reconciliation worker exists. |
| Phase 5 — Spend and refund | Foundation only | Posting and database refund invariants exist; no authenticated API or vendor workflow exists. |
| Phase 6 — Payout and reconciliation | Schema only | Payout batch structure exists; no scheduler, provider adapter, reservation logic, or reconciliation job exists. |
| Phase 7 — Realtime | Not implemented | Initial implementation can use polling. |
| Phase 8 — Verification billing | Not implemented | Remains separate from the stored-value wallet ledger. |

## Required next work

### 1. Prove the foundation against PostgreSQL

Before building public payment routes:

1. Review and apply the committed migration to an isolated development database.
2. Complete the university setup wizard if the database has no profile.
3. Run `npm run payments:bootstrap` or the explicit development variant.
4. Add database-backed tests that execute the real triggers and constraints.
5. Test concurrent spends, concurrent refunds, duplicate idempotency keys, transaction rollback, and projection rebuilding against PostgreSQL.

This is the most important outstanding foundation work. Unit tests cannot prove trigger or row-lock behavior.

### 2. Build a sandbox vertical slice

After the PostgreSQL tests pass, the recommended first usable slice is:

1. Development fixtures for one approved student, vendor, branch, and zero-balance wallet accounts.
2. Authenticated balance and transaction-history reads.
3. A controlled fake-provider top-up that still supplies unique provider attribution.
4. One branch QR lookup and student-to-vendor spend.
5. Vendor transaction visibility and an eligible refund.
6. Reconciliation assertions showing ledger totals equal projections.

Fixtures must call the same account and posting services as production code. They must never update `WalletAccountBalance` directly.

### 3. Implement real onboarding and authentication

- Student number/email matching and OTP delivery.
- Payment-specific student access and refresh sessions.
- Vendor payment profile and payout-destination onboarding.
- Per-branch payment applications, admin decisions, suspension, and QR identifiers.
- Explicit payment capabilities in the existing authorization map.
- Proxy exceptions for narrowly scoped wallet APIs and provider webhooks, with authoritative authentication inside each handler.

### 4. Select and integrate providers

- Choose a gateway with suitable custody, webhook, refund, chargeback, and reconciliation capabilities.
- Define a provider adapter rather than coupling routes directly to one SDK.
- Store secrets outside public university settings.
- Verify webhook signatures from the exact raw body.
- Treat provider timeouts as unknown outcomes and reconcile before retrying.
- Build payout reservation, submission, confirmation, and reconciliation flows.

## Product decisions still needed

- Payment gateway and payout provider.
- Student OTP channel, expiry, rate limits, and session lifetimes.
- Whether vendor staff may issue refunds or only vendor owners may do so.
- Minimum and maximum top-up, spend, and refund amounts.
- Payout cadence and minimum payout threshold.
- Provider-fee treatment.
- Exact chargeback and reversal policy.
- Financial-record retention and anonymization rules.

Before accepting real funds, the university and selected provider must also confirm custodial, settlement, KYC/KYB, chargeback, refund, tax, and regulatory responsibilities.

## Non-negotiable implementation rules

- Do not use `prisma db push` in place of the wallet migration; the financial triggers and checks would be omitted.
- Do not expose a general ledger-entry or balance-update endpoint.
- Do not update or delete completed wallet transactions or ledger entries.
- Do not infer gateway success from a browser redirect or client request.
- Do not store raw card details or unnecessary payer banking data.
- Do not make payment-provider network calls while holding wallet balance row locks.
- Do not make spend funds payout-eligible before their refund window closes.
- Do not treat the presence of future-phase tables as proof that those features are implemented.
