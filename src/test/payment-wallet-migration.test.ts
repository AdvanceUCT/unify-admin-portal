import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "prisma/migrations/20260904120000_add_payment_wallet_ledger_foundation/migration.sql",
);
const migration = readFileSync(migrationPath, "utf8");
const hardeningMigration = readFileSync(
  resolve(
    process.cwd(),
    "prisma/migrations/20260904150000_harden_payment_wallet_invariants/migration.sql",
  ),
  "utf8",
);
const walletSettingsRenameMigration = readFileSync(
  resolve(
    process.cwd(),
    "prisma/migrations/20260904160000_rename_payment_wallet_settings/migration.sql",
  ),
  "utf8",
);
const walletTopupProviderIdMigration = readFileSync(
  resolve(
    process.cwd(),
    "prisma/migrations/20260911133000_relax_pending_wallet_topup_provider_id/migration.sql",
  ),
  "utf8",
);
const walletPayoutProviderAttributionMigration = readFileSync(
  resolve(
    process.cwd(),
    "prisma/migrations/20260913191000_allow_wallet_payout_provider_attribution/migration.sql",
  ),
  "utf8",
);
const vendorTopupEnumMigration = readFileSync(
  resolve(
    process.cwd(),
    "prisma/migrations/20261006120000_add_vendor_topup_transaction_type/migration.sql",
  ),
  "utf8",
);
const refundsOverdraftMigration = readFileSync(
  resolve(
    process.cwd(),
    "prisma/migrations/20261006121000_refunds_overdraft_threshold_payouts/migration.sql",
  ),
  "utf8",
);

describe("payment wallet foundation migration", () => {
  it("creates the immutable ledger and rebuildable balance projection", () => {
    expect(migration).toContain('CREATE TABLE "ledger_entry"');
    expect(migration).toContain('CREATE TABLE "wallet_account_balance"');
    expect(migration).toContain("CREATE TRIGGER ledger_entry_immutable");
    expect(migration).toContain("CREATE TRIGGER ledger_entry_apply_balance");
    expect(migration).toContain("CREATE CONSTRAINT TRIGGER ledger_entry_requires_completed_transaction");
  });

  it("enforces account ownership, positive amounts, and scoped idempotency", () => {
    expect(migration).toContain('CONSTRAINT "wallet_account_owner_check"');
    expect(migration).toContain('CONSTRAINT "wallet_transaction_amount_check"');
    expect(migration).toContain('CONSTRAINT "ledger_entry_amount_check"');
    expect(migration).toContain('CREATE UNIQUE INDEX "wallet_transaction_idempotency_key"');
    expect(migration).toContain('WHERE "idempotencyKey" IS NOT NULL');
  });

  it("supports branch-level approvals with one vendor-level payment profile", () => {
    expect(migration).toContain('CREATE TABLE "vendor_payment_profile"');
    expect(migration).toContain('CREATE TABLE "vendor_branch_payment_application"');
    expect(migration).toContain('CREATE TABLE "vendor_branch_payment_acceptance"');
    expect(migration).toContain('CREATE UNIQUE INDEX "vendor_payment_profile_vendorProfileId_key"');
  });

  it("keeps payment-wallet settings on the university profile and omits generic adjustments", () => {
    expect(migration).toContain('ADD COLUMN "paymentsEnabled" BOOLEAN NOT NULL DEFAULT false');
    expect(migration).toContain('ADD COLUMN "paymentRefundWindowSeconds" INTEGER NOT NULL DEFAULT 600');
    expect(migration).not.toContain('CREATE TABLE "university_payment_config"');
    expect(migration).not.toContain("'ADJUSTMENT'");
    expect(migration).not.toContain("ADMIN_ADJUSTMENT_CLEARING");
  });

  it("preserves top-up and payout attribution", () => {
    expect(migration).toContain('CONSTRAINT "wallet_transaction_topup_provider_check"');
    expect(migration).toContain('CREATE UNIQUE INDEX "wallet_transaction_provider_payment_key"');
    expect(migration).toContain('"payoutDestinationReference" TEXT NOT NULL');
    expect(migration).toContain('CONSTRAINT "payout_batch_manual_initiator_check"');
    expect(migration).toContain("CREATE TRIGGER payout_batch_traceability_guard");
  });

  it("allows pending hosted top-ups before provider transaction attribution", () => {
    expect(walletTopupProviderIdMigration).toContain(
      'DROP CONSTRAINT "wallet_transaction_topup_provider_check"',
    );
    expect(walletTopupProviderIdMigration).toContain('"status" <> \'COMPLETED\'');
    expect(walletTopupProviderIdMigration).toContain(
      'Completed top-up requires provider attribution',
    );
    expect(walletTopupProviderIdMigration).toContain(
      'Wallet transaction provider payment id is immutable after attribution',
    );
  });

  it("allows payout transactions to retain provider attribution", () => {
    expect(walletPayoutProviderAttributionMigration).toContain(
      'DROP CONSTRAINT "wallet_transaction_topup_provider_check"',
    );
    expect(walletPayoutProviderAttributionMigration).toContain('"type" = \'PAYOUT\'');
    expect(walletPayoutProviderAttributionMigration).toContain(
      'NULLIF(BTRIM("providerPaymentId"), \'\') IS NOT NULL',
    );
    expect(walletPayoutProviderAttributionMigration).toContain(
      'NULLIF(BTRIM("providerPayerReference"), \'\') IS NOT NULL',
    );
    expect(walletPayoutProviderAttributionMigration).toContain(
      '"type" NOT IN (\'TOPUP\', \'PAYOUT\')',
    );
  });

  it("makes wallet identity immutable and enforces semantic postings", () => {
    expect(hardeningMigration).toContain("CREATE TRIGGER wallet_account_identity_guard");
    expect(hardeningMigration).toContain("CREATE TRIGGER ledger_entry_account_status_guard");
    expect(hardeningMigration).toContain("CREATE TRIGGER wallet_transaction_semantic_guard");
    expect(hardeningMigration).toContain("Spend refund and settlement timestamps do not match university policy");
    expect(hardeningMigration).toContain("Top-up ledger topology is invalid");
    expect(hardeningMigration).toContain("Refund ledger topology is invalid");
  });

  it("renames university settings to make their wallet-only scope explicit", () => {
    expect(walletSettingsRenameMigration).toContain(
      'RENAME COLUMN "paymentsEnabled" TO "paymentWalletEnabled"',
    );
    expect(walletSettingsRenameMigration).toContain(
      'RENAME COLUMN "paymentRefundWindowSeconds" TO "paymentWalletRefundWindowSeconds"',
    );
    expect(walletSettingsRenameMigration).toContain(
      'RENAME COLUMN "paymentSettlementDelaySeconds" TO "paymentWalletSettlementDelaySeconds"',
    );
    expect(walletSettingsRenameMigration).toContain(
      'BOOL_OR("paymentWalletEnabled")',
    );
  });

  it("adds enum values in their own migration before they are referenced", () => {
    expect(vendorTopupEnumMigration).toContain(`ALTER TYPE "WalletTransactionType" ADD VALUE 'VENDOR_TOPUP'`);
    expect(vendorTopupEnumMigration).not.toContain("CREATE OR REPLACE FUNCTION");
  });

  it("removes the refund window atomically and only after redefining the guards", () => {
    const body = refundsOverdraftMigration;
    expect(body).toMatch(/^BEGIN;\r?$/m);
    expect(body.trimEnd()).toMatch(/COMMIT;$/);
    expect(body).not.toContain("Refund window has expired");
    const lastFunction = body.lastIndexOf("CREATE OR REPLACE FUNCTION guard_wallet_transaction_semantics");
    expect(lastFunction).toBeGreaterThan(-1);
    expect(body.indexOf('DROP COLUMN "paymentWalletRefundWindowSeconds"')).toBeGreaterThan(lastFunction);
    expect(body).toContain("OR (account_type = 'VENDOR' AND transaction_type IN ('REFUND', 'PAYOUT'))");
  });

  it("always lets credits post to an overdrawn vendor wallet while debits keep the overdraft rule", () => {
    const body = readFileSync(
      resolve(process.cwd(), "prisma/migrations/20261007090000_allow_credits_to_overdrawn_vendor_wallets/migration.sql"),
      "utf8",
    );
    expect(body).toContain("CREATE OR REPLACE FUNCTION apply_ledger_entry_to_balance()");
    expect(body).toContain("OR signed_amount >= 0");
    expect(body).toContain("OR (account_type = 'VENDOR' AND transaction_type IN ('REFUND', 'PAYOUT'))");
  });
});
