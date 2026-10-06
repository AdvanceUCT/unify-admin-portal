# Refunds, overdraft & threshold payouts — implementation progress

Living record of execution against `docs/payments/REFUNDS_OVERDRAFT_PAYOUTS_IMPLEMENTATION_PLAN.md`.
The specification is `docs/payments/REFUNDS_OVERDRAFT_PAYOUTS.md` (§3 is normative and is never
edited by this work). Updated as each phase completes its gate. Records what was done, drift from the
plan (with reasons), migration names and deployment impact, and open follow-ups. Never records
credentials.

Legend: ✅ done and gate passed · 🟡 done, gate partially blocked · ⬜ not started.

Gate commands — portal: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, plus
`npm run test:payments:db` (with `DATABASE_URL`/`DIRECT_URL` set in the shell to the local
`unify_wallet_test` database) for phases that touch SQL or posting. POS: `typecheck`, `lint`, `test`,
`build`.

## Phase 0 — Planning documents — ✅

- Committed the specification, the approved implementation plan and this progress record.
- No code changes.

## Phase 1 — Migrations + ledger core — ✅ Gate 1 passed

**Migrations (deployment impact: run automatically by `prisma migrate deploy` on the production build)**

- `20261006120000_add_vendor_topup_transaction_type`: enum values only — `WalletTransactionType.VENDOR_TOPUP`
  and `AuditAction` `PAYMENT_WALLET_SETTINGS_UPDATED`, `VENDOR_PAYMENT_SUSPENDED`, `VENDOR_PAYMENT_REINSTATED`,
  `VENDOR_WALLET_TOPUP_COMPLETED`. Kept separate so no new value is used in the transaction that adds it.
- `20261006121000_refunds_overdraft_threshold_payouts` (wrapped in `BEGIN`/`COMMIT`): B1 settings
  (`paymentWalletPayoutThresholdMinor` default 50000, `paymentWalletOverdraftSuspensionDays` default 14, drops the
  refund-window/settlement columns and their CHECKs last), B2 `wallet_account_balance.negativeSince`, B3
  `apply_ledger_entry_to_balance` (vendor REFUND/PAYOUT may overdraw; `negativeSince` maintained for VENDOR
  accounts), B4 lifecycle guard (no refund window; new SPENDs must have NULL timestamps; `VENDOR_TOPUP` provider
  attribution), B5 semantics guard (no timestamp policy; REFUND eligibility R3; `VENDOR_TOPUP` topology), B6
  provider CHECK (PAYOUT branch preserved), B7 `suspensionCode`, B8 `vendor_wallet_topup_attempt`, B9 refund
  outbox column/constraints/partial unique index and trigger `wallet_refund_webhook_outbox`.
- Destructive part: the two university settings columns are dropped (values were defaults; no code reads them
  after this release).

**Code**

- `prisma/schema.prisma` per spec §6.3 (partial unique indexes declared with `where: raw(...)`, following the
  existing convention).
- `src/lib/payments/posting.ts`: spends no longer stamp `refundableUntil`/`availableForPayoutAt`; REFUND
  preparation checks R3 eligibility (`VENDOR_PAYMENT_SUSPENDED` / `VENDOR_NOT_PAYMENT_ENABLED` /
  `BRANCH_NOT_PAYMENT_ENABLED`) and the remaining amount (`PAYMENT_FULLY_REFUNDED` / `REFUND_AMOUNT_EXCEEDED`)
  inside the serializable transaction, after the idempotent-replay check; the funds check skips VENDOR debits for
  REFUND/PAYOUT; new `completePendingVendorTopup` shares one implementation with `completePendingTopup`.
- `config.ts`, `errors.ts` (7 new codes), `constants.ts` (`VENDOR_WALLET_TOPUP_REFERENCE_PREFIX`), `walletApi.ts`
  (403/409 mappings).
- `src/lib/vendors/refunds.ts`: only the window check removed (full rework is Phase 2).

**Tests**

- Unit: `payment-wallet-ledger.test.ts` (spend has no timestamps; one new test for refund overdraft, eligibility
  and remaining-amount errors), `payment-wallet-migration.test.ts` (enum migration isolation; B is transactional
  and drops columns after redefining guards), `setup-actions.test.ts` (fixture fields).
- New `src/test-integration/refunds-overdraft-postgres.test.ts` (real services on the migrated DB): refund of a
  400-day-old spend; non-null spend timestamps rejected; vendor negative only via REFUND/PAYOUT with
  `negativeSince` set/held/cleared, student and other-type overdrafts rejected; DB-level refund rejection for
  suspended profile / revoked application / non-active acceptance; concurrent partial refunds; `VENDOR_TOPUP`
  attribution and topology; refund outbox (one event per refund with cumulative totals and delivery, rollback,
  none for legacy spends, terminal event still unique, events immutable).

**Evidence**

- Baseline before changes (fresh `unify_wallet_test`, existing migrations): `test:payments:db` 7 files / 76 tests
  passed.
- After: `lint` 0 errors (12 pre-existing warnings, none in touched files); `typecheck` pass; `npm test` 145 files
  / 979 tests passed; `build` pass; `test:payments:db` 8 files / 84 tests passed on two consecutive runs.

## Phase 2 — Refunds service, API, read model, outbox dispatch — ⬜

## Phase 3 — Payouts + overdraft monitor — ⬜

## Phase 4 — Vendor top-ups (backend) — ⬜

## Phase 5 — Portal UI, admin settings, copy, portal docs — ⬜

## Phase 6 — POS simulator — ⬜

## Drift log

| # | Phase | Drift from plan/spec | Reason |
|---|---|---|---|
| 1 | 1 | B7 CHECK relaxed to `"suspensionCode" IS NULL OR "status" = 'SUSPENDED'` (spec default was the strict equality). | The strict form failed on the test database, which held a `SUSPENDED` profile without a cause; production could hold manual suspensions too. The spec explicitly permits this relaxation, and E4 already anticipates non-overdraft suspensions (never auto-reinstated). |
| 2 | 1 | Migration B wrapped in `BEGIN`/`COMMIT`. | Prisma does not wrap migrations in a transaction; the failed first attempt left partial columns behind. Matches `20260930180000_payment_webhook_outbox`. |
| 3 | 1 | `negativeSince` maintained for VENDOR accounts only. | Spec allows limiting it to VENDOR; other account types never go negative except SYSTEM, where it is meaningless. |
| 4 | 1 | New DB invariant tests live in a new Prisma-based suite (`refunds-overdraft-postgres.test.ts`) instead of `payment-wallet-postgres.test.ts`. | That suite replays only the three foundation-era migrations into a scratch schema and cannot exercise the current trigger definitions; its "refund window" assertion was removed (its aggregate-limit check stays). |
| 5 | 1 | `pos-payment-requests.test.ts`: the two "park other fixtures" steps also park `IN_FLIGHT` deliveries. | Pre-existing isolation gap: expired leases left by earlier runs on a persistent test DB were claimable, failing re-runs. Test-only change. |
| 6 | 1 | Remaining-amount checks moved into posting (inside the serializable transaction). | Planned; recorded here because `refunds.ts` still pre-checks until Phase 2 replaces it. |
