// @vitest-environment node

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { config } from "dotenv";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

config({ path: ".env.local" });
config({ path: ".env" });

const MIGRATION_NAME = "20260904120000_add_payment_wallet_ledger_foundation";
const HARDENING_MIGRATION_NAME = "20260904150000_harden_payment_wallet_invariants";
const migrationSql = [MIGRATION_NAME, HARDENING_MIGRATION_NAME]
  .map((name) =>
    readFileSync(resolve(process.cwd(), "prisma/migrations", name, "migration.sql"), "utf8"),
  )
  .join("\n");
const schemaName = `unify_wallet_it_${randomUUID().replaceAll("-", "")}`;

let pool: Pool;

type WalletFixture = {
  branchId: string;
  gatewayAccountId: string;
  studentAccountId: string;
  studentId: string;
  vendorAccountId: string;
  vendorId: string;
};

function quotedTestSchema() {
  if (!/^unify_wallet_it_[a-f0-9]{32}$/.test(schemaName)) {
    throw new Error("Refusing to use an invalid payment-wallet integration schema name.");
  }
  return `"${schemaName}"`;
}

async function getClient() {
  const client = await pool.connect();
  await client.query(`SET search_path TO ${quotedTestSchema()}`);
  return client;
}

async function runInTransaction<T>(
  client: PoolClient,
  operation: () => Promise<T>,
) {
  await client.query("BEGIN");
  try {
    const result = await operation();
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function createFixture(client: PoolClient, label: string): Promise<WalletFixture> {
  const suffix = `${label}-${randomUUID()}`;
  const fixture = {
    branchId: `branch-${suffix}`,
    gatewayAccountId: "gateway-account",
    studentAccountId: `student-account-${suffix}`,
    studentId: `student-${suffix}`,
    vendorAccountId: `vendor-account-${suffix}`,
    vendorId: `vendor-${suffix}`,
  };

  await client.query('INSERT INTO "student" ("id") VALUES ($1)', [fixture.studentId]);
  await client.query('INSERT INTO "vendor_profile" ("id") VALUES ($1)', [fixture.vendorId]);
  await client.query(
    'INSERT INTO "vendor_branch" ("id", "vendorProfileId") VALUES ($1, $2)',
    [fixture.branchId, fixture.vendorId],
  );
  await client.query(
    `INSERT INTO "wallet_account" ("id", "type", "studentId")
     VALUES ($1, 'STUDENT', $2)`,
    [fixture.studentAccountId, fixture.studentId],
  );
  await client.query(
    `INSERT INTO "wallet_account" ("id", "type", "vendorProfileId")
     VALUES ($1, 'VENDOR', $2)`,
    [fixture.vendorAccountId, fixture.vendorId],
  );
  await client.query(
    `INSERT INTO "wallet_account" ("id", "type", "systemCode")
     VALUES ($1, 'SYSTEM', 'GATEWAY_CLEARING')
     ON CONFLICT ("systemCode") DO NOTHING`,
    [fixture.gatewayAccountId],
  );
  await client.query(
    `INSERT INTO "vendor_application" ("id", "vendorProfileId", "status")
     VALUES ($1, $2, 'APPROVED')`,
    [`vendor-application-${suffix}`, fixture.vendorId],
  );
  await client.query(
    `INSERT INTO "vendor_payment_profile" (
      "id", "vendorProfileId", "status", "updatedAt"
    ) VALUES ($1, $2, 'APPROVED', CURRENT_TIMESTAMP)`,
    [`payment-profile-${suffix}`, fixture.vendorId],
  );
  const paymentApplicationId = `payment-application-${suffix}`;
  await client.query(
    `INSERT INTO "vendor_branch_payment_application" (
      "id", "vendorBranchId", "status", "updatedAt"
    ) VALUES ($1, $2, 'APPROVED', CURRENT_TIMESTAMP)`,
    [paymentApplicationId, fixture.branchId],
  );
  await client.query(
    `INSERT INTO "vendor_branch_payment_acceptance" (
      "id", "vendorBranchId", "approvedApplicationId", "status", "qrIdentifier",
      "approvedAt", "updatedAt"
    ) VALUES ($1, $2, $3, 'ACTIVE', $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [`payment-acceptance-${suffix}`, fixture.branchId, paymentApplicationId, `qr-${suffix}`],
  );

  return fixture;
}

async function postTopup(
  client: PoolClient,
  fixture: WalletFixture,
  amountMinor: number,
  label: string,
) {
  const transactionId = `topup-${label}-${randomUUID()}`;

  await runInTransaction(client, async () => {
    await client.query(
      `INSERT INTO "wallet_transaction" (
        "id", "type", "amountMinor", "initiatorAccountId", "idempotencyKey",
        "paymentProvider", "providerPaymentId"
      ) VALUES ($1, 'TOPUP', $2, $3, $4, 'integration-gateway', $5)`,
      [
        transactionId,
        amountMinor,
        fixture.studentAccountId,
        `topup-key-${label}-${randomUUID()}`,
        `provider-payment-${label}-${randomUUID()}`,
      ],
    );
    await client.query(
      `INSERT INTO "ledger_entry" (
        "id", "walletTransactionId", "accountId", "sequence", "direction", "amountMinor", "currency"
      ) VALUES
        ($1, $2, $3, 0, 'DEBIT', $4, 'ZAR'),
        ($5, $2, $6, 1, 'CREDIT', $4, 'ZAR')`,
      [
        `entry-${randomUUID()}`,
        transactionId,
        fixture.gatewayAccountId,
        amountMinor,
        `entry-${randomUUID()}`,
        fixture.studentAccountId,
      ],
    );
    await client.query(
      `UPDATE "wallet_transaction"
       SET "status" = 'COMPLETED', "completedAt" = CURRENT_TIMESTAMP
       WHERE "id" = $1`,
      [transactionId],
    );
  });

  return transactionId;
}

async function postSpend(
  client: PoolClient,
  fixture: WalletFixture,
  amountMinor: number,
  label: string,
  expired = false,
) {
  const transactionId = `spend-${label}-${randomUUID()}`;
  const completedAtExpression = expired
    ? "CURRENT_TIMESTAMP - INTERVAL '11 minutes'"
    : "CURRENT_TIMESTAMP";

  await runInTransaction(client, async () => {
    await client.query(
      `INSERT INTO "wallet_transaction" (
        "id", "type", "amountMinor", "initiatorAccountId", "vendorBranchId",
        "idempotencyKey", "refundableUntil", "availableForPayoutAt"
      ) VALUES (
        $1, 'SPEND', $2, $3, $4, $5,
        ${completedAtExpression} + INTERVAL '10 minutes',
        ${completedAtExpression} + INTERVAL '10 minutes'
      )`,
      [
        transactionId,
        amountMinor,
        fixture.studentAccountId,
        fixture.branchId,
        `spend-key-${label}-${randomUUID()}`,
      ],
    );
    await client.query(
      `INSERT INTO "ledger_entry" (
        "id", "walletTransactionId", "accountId", "sequence", "direction", "amountMinor", "currency"
      ) VALUES
        ($1, $2, $3, 0, 'DEBIT', $4, 'ZAR'),
        ($5, $2, $6, 1, 'CREDIT', $4, 'ZAR')`,
      [
        `entry-${randomUUID()}`,
        transactionId,
        fixture.studentAccountId,
        amountMinor,
        `entry-${randomUUID()}`,
        fixture.vendorAccountId,
      ],
    );
    await client.query(
      `UPDATE "wallet_transaction"
       SET "status" = 'COMPLETED', "completedAt" = ${completedAtExpression}
       WHERE "id" = $1`,
      [transactionId],
    );
  });

  return transactionId;
}

async function postRefund(
  client: PoolClient,
  fixture: WalletFixture,
  originalTransactionId: string,
  amountMinor: number,
  label: string,
) {
  const transactionId = `refund-${label}-${randomUUID()}`;

  await runInTransaction(client, async () => {
    await client.query(
      `INSERT INTO "wallet_transaction" (
        "id", "type", "amountMinor", "initiatorAccountId", "vendorBranchId",
        "linkedTransactionId", "idempotencyKey"
      ) VALUES ($1, 'REFUND', $2, $3, $4, $5, $6)`,
      [
        transactionId,
        amountMinor,
        fixture.vendorAccountId,
        fixture.branchId,
        originalTransactionId,
        `refund-key-${label}-${randomUUID()}`,
      ],
    );
    await client.query(
      `INSERT INTO "ledger_entry" (
        "id", "walletTransactionId", "accountId", "sequence", "direction", "amountMinor", "currency"
      ) VALUES
        ($1, $2, $3, 0, 'DEBIT', $4, 'ZAR'),
        ($5, $2, $6, 1, 'CREDIT', $4, 'ZAR')`,
      [
        `entry-${randomUUID()}`,
        transactionId,
        fixture.vendorAccountId,
        amountMinor,
        `entry-${randomUUID()}`,
        fixture.studentAccountId,
      ],
    );
    await client.query(
      `UPDATE "wallet_transaction"
       SET "status" = 'COMPLETED', "completedAt" = CURRENT_TIMESTAMP
       WHERE "id" = $1`,
      [transactionId],
    );
  });

  return transactionId;
}

async function readBalance(client: PoolClient, accountId: string) {
  const result = await client.query<{ postedBalanceMinor: string }>(
    `SELECT "postedBalanceMinor"::text AS "postedBalanceMinor"
     FROM "wallet_account_balance"
     WHERE "accountId" = $1`,
    [accountId],
  );
  return result.rows[0]?.postedBalanceMinor;
}

beforeAll(async () => {
  if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") {
    throw new Error("Refusing to run payment-wallet database tests in production.");
  }

  if (!process.env.DIRECT_URL) {
    throw new Error(
      "DIRECT_URL is required for payment-wallet PostgreSQL tests and must point to the migrated test database.",
    );
  }

  pool = new Pool({ connectionString: process.env.DIRECT_URL, max: 8 });
  const client = await pool.connect();

  try {
    const appliedMigrations = await client.query(
      `SELECT 1
       FROM "public"."_prisma_migrations"
       WHERE "migration_name" = ANY($1::text[])
         AND "finished_at" IS NOT NULL
         AND "rolled_back_at" IS NULL`,
      [[MIGRATION_NAME, HARDENING_MIGRATION_NAME]],
    );
    if (appliedMigrations.rowCount !== 2) {
      throw new Error(
        "Payment-wallet migrations are not recorded as applied on DIRECT_URL.",
      );
    }

    await client.query(`CREATE SCHEMA ${quotedTestSchema()}`);
    await client.query(`SET search_path TO ${quotedTestSchema()}`);
    await client.query(`
      CREATE TABLE "user" ("id" TEXT PRIMARY KEY);
      CREATE TABLE "student" ("id" TEXT PRIMARY KEY);
      CREATE TABLE "vendor_profile" ("id" TEXT PRIMARY KEY);
      CREATE TABLE "vendor_branch" (
        "id" TEXT PRIMARY KEY,
        "vendorProfileId" TEXT NOT NULL REFERENCES "vendor_profile"("id"),
        "active" BOOLEAN NOT NULL DEFAULT true,
        "status" TEXT NOT NULL DEFAULT 'ACTIVE'
      );
      CREATE TABLE "vendor_application" (
        "id" TEXT PRIMARY KEY,
        "vendorProfileId" TEXT NOT NULL REFERENCES "vendor_profile"("id"),
        "status" TEXT NOT NULL
      );
      CREATE TABLE "university_profile" ("id" TEXT PRIMARY KEY);
    `);
    await client.query(migrationSql);
    await client.query('INSERT INTO "university_profile" ("id") VALUES ($1)', [
      "integration-university",
    ]);
    await client.query(
      'UPDATE "university_profile" SET "paymentsEnabled" = true WHERE "id" = $1',
      ["integration-university"],
    );
  } finally {
    client.release();
  }
});

afterAll(async () => {
  if (!pool) return;
  await pool.query(`DROP SCHEMA IF EXISTS ${quotedTestSchema()} CASCADE`);
  await pool.end();
});

describe("payment wallet PostgreSQL invariants", () => {
  it("creates a zero projection and rejects direct balance mutation", async () => {
    const client = await getClient();
    try {
      const fixture = await createFixture(client, "projection");

      await expect(readBalance(client, fixture.studentAccountId)).resolves.toBe("0");
      await expect(
        client.query(
          `UPDATE "wallet_account_balance"
           SET "postedBalanceMinor" = 100
           WHERE "accountId" = $1`,
          [fixture.studentAccountId],
        ),
      ).rejects.toThrow(/only be updated by ledger posting/i);
      await expect(readBalance(client, fixture.studentAccountId)).resolves.toBe("0");
    } finally {
      client.release();
    }
  });

  it("makes wallet account identity immutable and closed status terminal", async () => {
    const client = await getClient();
    try {
      const fixture = await createFixture(client, "account-identity");

      await expect(
        client.query(
          `UPDATE "wallet_account"
           SET "type" = 'VENDOR', "studentId" = NULL, "vendorProfileId" = $2
           WHERE "id" = $1`,
          [fixture.studentAccountId, fixture.vendorId],
        ),
      ).rejects.toThrow(/identity fields are immutable/i);

      await client.query(
        `UPDATE "wallet_account"
         SET "status" = 'CLOSED', "closedAt" = CURRENT_TIMESTAMP
         WHERE "id" = $1`,
        [fixture.studentAccountId],
      );
      await expect(
        client.query(
          `UPDATE "wallet_account"
           SET "status" = 'ACTIVE', "closedAt" = NULL
           WHERE "id" = $1`,
          [fixture.studentAccountId],
        ),
      ).rejects.toThrow(/cannot be reopened/i);
    } finally {
      client.release();
    }
  });

  it("posts a balanced top-up and makes ledger history immutable", async () => {
    const client = await getClient();
    try {
      const fixture = await createFixture(client, "topup");
      const transactionId = await postTopup(client, fixture, 5_000, "successful");

      await expect(readBalance(client, fixture.gatewayAccountId)).resolves.toBe("-5000");
      await expect(readBalance(client, fixture.studentAccountId)).resolves.toBe("5000");
      await expect(
        client.query(
          `UPDATE "ledger_entry" SET "amountMinor" = 1
           WHERE "walletTransactionId" = $1`,
          [transactionId],
        ),
      ).rejects.toThrow(/immutable/i);
      await expect(
        client.query('DELETE FROM "wallet_transaction" WHERE "id" = $1', [transactionId]),
      ).rejects.toThrow(/cannot be deleted/i);
    } finally {
      client.release();
    }
  });

  it("rolls back entries and projections when completion is unbalanced", async () => {
    const client = await getClient();
    try {
      const fixture = await createFixture(client, "unbalanced");
      const transactionId = `unbalanced-${randomUUID()}`;
      const gatewayBalanceBefore = await readBalance(client, fixture.gatewayAccountId);

      await client.query("BEGIN");
      await client.query(
        `INSERT INTO "wallet_transaction" (
          "id", "type", "amountMinor", "initiatorAccountId", "idempotencyKey",
          "paymentProvider", "providerPaymentId"
        ) VALUES ($1, 'TOPUP', 5000, $2, $3, 'integration-gateway', $4)`,
        [transactionId, fixture.studentAccountId, randomUUID(), randomUUID()],
      );
      await client.query(
        `INSERT INTO "ledger_entry" (
          "id", "walletTransactionId", "accountId", "sequence", "direction", "amountMinor", "currency"
        ) VALUES
          ($1, $2, $3, 0, 'DEBIT', 5000, 'ZAR'),
          ($4, $2, $5, 1, 'CREDIT', 4900, 'ZAR')`,
        [
          `entry-${randomUUID()}`,
          transactionId,
          fixture.gatewayAccountId,
          `entry-${randomUUID()}`,
          fixture.studentAccountId,
        ],
      );
      await expect(
        client.query(
          `UPDATE "wallet_transaction"
           SET "status" = 'COMPLETED', "completedAt" = CURRENT_TIMESTAMP
           WHERE "id" = $1`,
          [transactionId],
        ),
      ).rejects.toThrow(/balanced entries/i);
      await client.query("ROLLBACK");

      await expect(readBalance(client, fixture.gatewayAccountId)).resolves.toBe(gatewayBalanceBefore);
      await expect(readBalance(client, fixture.studentAccountId)).resolves.toBe("0");
      const transaction = await client.query(
        'SELECT 1 FROM "wallet_transaction" WHERE "id" = $1',
        [transactionId],
      );
      expect(transaction.rowCount).toBe(0);
    } finally {
      client.release();
    }
  });

  it("rejects balanced entries whose accounts do not match the transaction type", async () => {
    const client = await getClient();
    try {
      const fixture = await createFixture(client, "invalid-topology");
      const transactionId = `invalid-topology-${randomUUID()}`;

      await expect(
        runInTransaction(client, async () => {
          await client.query(
            `INSERT INTO "wallet_transaction" (
              "id", "type", "amountMinor", "initiatorAccountId", "idempotencyKey",
              "paymentProvider", "providerPaymentId"
            ) VALUES ($1, 'TOPUP', 500, $2, $3, 'PAYFAST_SANDBOX', $4)`,
            [transactionId, fixture.studentAccountId, randomUUID(), randomUUID()],
          );
          await client.query(
            `INSERT INTO "ledger_entry" (
              "id", "walletTransactionId", "accountId", "sequence", "direction", "amountMinor", "currency"
            ) VALUES
              ($1, $2, $3, 0, 'DEBIT', 500, 'ZAR'),
              ($4, $2, $5, 1, 'CREDIT', 500, 'ZAR')`,
            [
              `entry-${randomUUID()}`,
              transactionId,
              fixture.gatewayAccountId,
              `entry-${randomUUID()}`,
              fixture.vendorAccountId,
            ],
          );
          await client.query(
            `UPDATE "wallet_transaction"
             SET "status" = 'COMPLETED', "completedAt" = CURRENT_TIMESTAMP
             WHERE "id" = $1`,
            [transactionId],
          );
        }),
      ).rejects.toThrow(/top-up ledger topology is invalid/i);
    } finally {
      client.release();
    }
  });

  it("rejects spend timestamps that do not match university policy", async () => {
    const client = await getClient();
    try {
      const fixture = await createFixture(client, "invalid-policy-time");
      await postTopup(client, fixture, 1_000, "invalid-policy-time-funds");
      const transactionId = `invalid-policy-time-${randomUUID()}`;

      await expect(
        runInTransaction(client, async () => {
          await client.query(
            `INSERT INTO "wallet_transaction" (
              "id", "type", "amountMinor", "initiatorAccountId", "vendorBranchId",
              "idempotencyKey", "refundableUntil", "availableForPayoutAt"
            ) VALUES (
              $1, 'SPEND', 500, $2, $3, $4,
              CURRENT_TIMESTAMP + INTERVAL '1 hour',
              CURRENT_TIMESTAMP + INTERVAL '1 hour'
            )`,
            [transactionId, fixture.studentAccountId, fixture.branchId, randomUUID()],
          );
          await client.query(
            `INSERT INTO "ledger_entry" (
              "id", "walletTransactionId", "accountId", "sequence", "direction", "amountMinor", "currency"
            ) VALUES
              ($1, $2, $3, 0, 'DEBIT', 500, 'ZAR'),
              ($4, $2, $5, 1, 'CREDIT', 500, 'ZAR')`,
            [
              `entry-${randomUUID()}`,
              transactionId,
              fixture.studentAccountId,
              `entry-${randomUUID()}`,
              fixture.vendorAccountId,
            ],
          );
          await client.query(
            `UPDATE "wallet_transaction"
             SET "status" = 'COMPLETED', "completedAt" = CURRENT_TIMESTAMP
             WHERE "id" = $1`,
            [transactionId],
          );
        }),
      ).rejects.toThrow(/do not match university policy/i);
    } finally {
      client.release();
    }
  });

  it("rejects committing ledger entries on a pending transaction", async () => {
    const client = await getClient();
    try {
      const fixture = await createFixture(client, "pending");
      const transactionId = `pending-${randomUUID()}`;

      await client.query("BEGIN");
      await client.query(
        `INSERT INTO "wallet_transaction" (
          "id", "type", "amountMinor", "initiatorAccountId", "idempotencyKey",
          "paymentProvider", "providerPaymentId"
        ) VALUES ($1, 'TOPUP', 1000, $2, $3, 'integration-gateway', $4)`,
        [transactionId, fixture.studentAccountId, randomUUID(), randomUUID()],
      );
      await client.query(
        `INSERT INTO "ledger_entry" (
          "id", "walletTransactionId", "accountId", "sequence", "direction", "amountMinor", "currency"
        ) VALUES
          ($1, $2, $3, 0, 'DEBIT', 1000, 'ZAR'),
          ($4, $2, $5, 1, 'CREDIT', 1000, 'ZAR')`,
        [
          `entry-${randomUUID()}`,
          transactionId,
          fixture.gatewayAccountId,
          `entry-${randomUUID()}`,
          fixture.studentAccountId,
        ],
      );

      await expect(client.query("COMMIT")).rejects.toThrow(/must be completed before commit/i);
      await client.query("ROLLBACK");
      const transaction = await client.query(
        'SELECT 1 FROM "wallet_transaction" WHERE "id" = $1',
        [transactionId],
      );
      expect(transaction.rowCount).toBe(0);
    } finally {
      client.release();
    }
  });

  it("enforces account-scoped idempotency keys", async () => {
    const client = await getClient();
    try {
      const fixture = await createFixture(client, "idempotency");
      const idempotencyKey = `same-key-${randomUUID()}`;
      await client.query(
        `INSERT INTO "wallet_transaction" (
          "id", "type", "amountMinor", "initiatorAccountId", "idempotencyKey",
          "paymentProvider", "providerPaymentId"
        ) VALUES ($1, 'TOPUP', 1000, $2, $3, 'integration-gateway', $4)`,
        [`first-${randomUUID()}`, fixture.studentAccountId, idempotencyKey, randomUUID()],
      );

      await expect(
        client.query(
          `INSERT INTO "wallet_transaction" (
            "id", "type", "amountMinor", "initiatorAccountId", "idempotencyKey",
            "paymentProvider", "providerPaymentId"
          ) VALUES ($1, 'TOPUP', 1000, $2, $3, 'integration-gateway', $4)`,
          [`second-${randomUUID()}`, fixture.studentAccountId, idempotencyKey, randomUUID()],
        ),
      ).rejects.toMatchObject({ code: "23505" });
    } finally {
      client.release();
    }
  });

  it("enforces refund windows and aggregate refund limits", async () => {
    const client = await getClient();
    try {
      const fixture = await createFixture(client, "refunds");
      await postTopup(client, fixture, 3_000, "refund-funds");
      const originalSpendId = await postSpend(client, fixture, 1_000, "refundable");
      await postSpend(client, fixture, 1_000, "unrelated-vendor-funds");
      await postRefund(client, fixture, originalSpendId, 600, "first-partial");

      await expect(
        postRefund(client, fixture, originalSpendId, 500, "excess-partial"),
      ).rejects.toThrow(/refund total exceeds/i);

      const expiredSpendId = await postSpend(client, fixture, 500, "expired", true);
      await expect(
        postRefund(client, fixture, expiredSpendId, 100, "expired"),
      ).rejects.toThrow(/refund window has expired/i);

      const refundTotal = await client.query<{ total: string }>(
        `SELECT COALESCE(SUM("amountMinor"), 0)::text AS total
         FROM "wallet_transaction"
         WHERE "type" = 'REFUND'
           AND "status" = 'COMPLETED'
           AND "linkedTransactionId" = $1`,
        [originalSpendId],
      );
      expect(refundTotal.rows[0].total).toBe("600");
    } finally {
      client.release();
    }
  });

  it("allows an eligible refund while the student and vendor accounts are suspended", async () => {
    const client = await getClient();
    try {
      const fixture = await createFixture(client, "suspended-refund");
      await postTopup(client, fixture, 1_000, "suspended-refund-funds");
      const spendId = await postSpend(client, fixture, 600, "suspended-refund-spend");

      await client.query(
        `UPDATE "wallet_account"
         SET "status" = 'SUSPENDED'
         WHERE "id" IN ($1, $2)`,
        [fixture.studentAccountId, fixture.vendorAccountId],
      );
      await postRefund(client, fixture, spendId, 200, "suspended-refund-success");

      await expect(readBalance(client, fixture.studentAccountId)).resolves.toBe("600");
      await expect(readBalance(client, fixture.vendorAccountId)).resolves.toBe("400");
      await expect(postSpend(client, fixture, 100, "suspended-spend-rejected")).rejects.toThrow(
        /suspended wallet accounts/i,
      );
    } finally {
      client.release();
    }
  });

  it("serializes concurrent spends so a student cannot be overdrawn", async () => {
    const setupClient = await getClient();
    const firstClient = await getClient();
    const secondClient = await getClient();
    try {
      const fixture = await createFixture(setupClient, "concurrent-spend");
      await postTopup(setupClient, fixture, 1_000, "concurrent-spend-funds");

      const results = await Promise.allSettled([
        postSpend(firstClient, fixture, 800, "concurrent-a"),
        postSpend(secondClient, fixture, 800, "concurrent-b"),
      ]);

      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
      await expect(readBalance(setupClient, fixture.studentAccountId)).resolves.toBe("200");
      await expect(readBalance(setupClient, fixture.vendorAccountId)).resolves.toBe("800");
    } finally {
      setupClient.release();
      firstClient.release();
      secondClient.release();
    }
  });

  it("serializes concurrent partial refunds so their aggregate cannot exceed the spend", async () => {
    const setupClient = await getClient();
    const firstClient = await getClient();
    const secondClient = await getClient();
    try {
      const fixture = await createFixture(setupClient, "concurrent-refund");
      await postTopup(setupClient, fixture, 3_000, "concurrent-refund-funds");
      const originalSpendId = await postSpend(setupClient, fixture, 1_000, "refund-original");
      await postSpend(setupClient, fixture, 1_000, "refund-extra-vendor-funds");

      const results = await Promise.allSettled([
        postRefund(firstClient, fixture, originalSpendId, 700, "concurrent-refund-a"),
        postRefund(secondClient, fixture, originalSpendId, 700, "concurrent-refund-b"),
      ]);

      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
      const refundTotal = await setupClient.query<{ total: string }>(
        `SELECT COALESCE(SUM("amountMinor"), 0)::text AS total
         FROM "wallet_transaction"
         WHERE "type" = 'REFUND'
           AND "status" = 'COMPLETED'
           AND "linkedTransactionId" = $1`,
        [originalSpendId],
      );
      expect(refundTotal.rows[0].total).toBe("700");
      await expect(readBalance(setupClient, fixture.vendorAccountId)).resolves.toBe("1300");
      await expect(readBalance(setupClient, fixture.studentAccountId)).resolves.toBe("1700");
    } finally {
      setupClient.release();
      firstClient.release();
      secondClient.release();
    }
  });
});
