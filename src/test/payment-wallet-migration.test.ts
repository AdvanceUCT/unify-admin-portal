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

  it("keeps payment settings on the university profile and omits generic adjustments", () => {
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

  it("makes wallet identity immutable and enforces semantic postings", () => {
    expect(hardeningMigration).toContain("CREATE TRIGGER wallet_account_identity_guard");
    expect(hardeningMigration).toContain("CREATE TRIGGER ledger_entry_account_status_guard");
    expect(hardeningMigration).toContain("CREATE TRIGGER wallet_transaction_semantic_guard");
    expect(hardeningMigration).toContain("Spend refund and settlement timestamps do not match university policy");
    expect(hardeningMigration).toContain("Top-up ledger topology is invalid");
    expect(hardeningMigration).toContain("Refund ledger topology is invalid");
  });
});
