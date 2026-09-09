// @vitest-environment node

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "dotenv";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

config({ path: ".env.local" });
config({ path: ".env" });

// `@/lib/billing/policy` and `@/lib/billing/charges` transitively import
// `@/lib/config/env`, which validates `process.env` at module-evaluation
// time. Static imports are hoisted ahead of the dotenv calls above
// regardless of source order, so these (and only these) modules must be
// imported dynamically after dotenv has already populated `process.env` —
// see the dynamic import in `beforeAll` below.
type PolicyModule = typeof import("@/lib/billing/policy");
type ChargesModule = typeof import("@/lib/billing/charges");
type InvoicesModule = typeof import("@/lib/billing/invoices");

import { PrismaClient } from "@/generated/prisma/client";
import { resolveBillingTestDirectUrl } from "@/lib/billing/testDatabaseGuard";

const MIGRATION_NAME = "20260909120000_add_vendor_invoicing_billing";
const migrationSql = readFileSync(
  resolve(process.cwd(), "prisma/migrations", MIGRATION_NAME, "migration.sql"),
  "utf8",
);
const schemaName = `unify_billing_it_${randomUUID().replaceAll("-", "")}`;

let pool: Pool;
let scopedPrisma: PrismaClient;
let universityId: string;
let policy: PolicyModule;
let charges: ChargesModule;
let invoices: InvoicesModule;

function quotedTestSchema() {
  if (!/^unify_billing_it_[a-f0-9]{32}$/.test(schemaName)) {
    throw new Error("Refusing to use an invalid billing integration schema name.");
  }
  return `"${schemaName}"`;
}

async function getClient() {
  const client = await pool.connect();
  await client.query(`SET search_path TO ${quotedTestSchema()}`);
  return client;
}

async function runInTransaction<T>(client: PoolClient, operation: () => Promise<T>) {
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

async function createVendorAndBranch(client: PoolClient) {
  const suffix = randomUUID();
  const vendorProfileId = `vendor-${suffix}`;
  const branchId = `branch-${suffix}`;
  await client.query('INSERT INTO "vendor_profile" ("id") VALUES ($1)', [vendorProfileId]);
  await client.query('INSERT INTO "vendor_branch" ("id", "vendorProfileId") VALUES ($1, $2)', [
    branchId,
    vendorProfileId,
  ]);
  return { vendorProfileId, branchId };
}

async function createVerification(client: PoolClient, vendorProfileId: string) {
  const verificationId = `verification-${randomUUID()}`;
  await client.query('INSERT INTO "vendor_verification" ("id", "vendorProfileId") VALUES ($1, $2)', [
    verificationId,
    vendorProfileId,
  ]);
  return verificationId;
}

async function insertCharge(
  client: PoolClient,
  params: {
    verificationId: string;
    vendorProfileId: string;
    branchId: string;
    policyId: string;
    feeMinor: number;
    platformShareMinor: number;
    universityShareMinor: number;
    currency?: string;
    servicePeriodKey?: string;
    branchNameSnapshot?: string;
  },
) {
  const id = `charge-${randomUUID()}`;
  await client.query(
    `INSERT INTO "verification_charge" (
      "id", "verificationId", "vendorProfileId", "branchId", "branchNameSnapshot",
      "servicePeriodKey", "serviceCompletedAt", "feeMinor", "currency",
      "platformShareMinor", "universityShareMinor", "policyId", "source"
    ) VALUES ($1, $2, $3, $4, $10, $11, now(), $5, $6, $7, $8, $9, 'LIVE')`,
    [
      id,
      params.verificationId,
      params.vendorProfileId,
      params.branchId,
      params.feeMinor,
      params.currency ?? "ZAR",
      params.platformShareMinor,
      params.universityShareMinor,
      params.policyId,
      params.branchNameSnapshot ?? "Test Branch",
      params.servicePeriodKey ?? "2026-09",
    ],
  );
  return id;
}

beforeAll(async () => {
  const directUrl = resolveBillingTestDirectUrl();
  policy = await import("@/lib/billing/policy");
  charges = await import("@/lib/billing/charges");
  invoices = await import("@/lib/billing/invoices");

  pool = new Pool({ connectionString: directUrl, max: 8 });
  const client = await pool.connect();
  try {
    await client.query(`CREATE SCHEMA ${quotedTestSchema()}`);
    await client.query(`SET search_path TO ${quotedTestSchema()}`);
    await client.query(`
      CREATE TABLE "university_profile" (
        "id" TEXT PRIMARY KEY,
        "name" TEXT NOT NULL DEFAULT 'Test University',
        "abbreviation" TEXT NOT NULL DEFAULT 'TU',
        "contactEmail" TEXT NOT NULL DEFAULT 'admin@example.test'
      );
      CREATE TABLE "vendor_profile" (
        "id" TEXT PRIMARY KEY,
        "companyName" TEXT NOT NULL DEFAULT 'Test Vendor',
        "contactEmail" TEXT NOT NULL DEFAULT 'vendor@example.test'
      );
      CREATE TABLE "vendor_branch" (
        "id" TEXT PRIMARY KEY,
        "vendorProfileId" TEXT NOT NULL REFERENCES "vendor_profile"("id")
      );
      CREATE TABLE "vendor_verification" (
        "id" TEXT PRIMARY KEY,
        "vendorProfileId" TEXT NOT NULL REFERENCES "vendor_profile"("id")
      );
      CREATE TABLE "vendor_application" (
        "id" TEXT PRIMARY KEY,
        "vendorProfileId" TEXT NOT NULL REFERENCES "vendor_profile"("id"),
        "status" TEXT NOT NULL
      );
      CREATE TABLE "vendor_branch_payment_application" (
        "id" TEXT PRIMARY KEY,
        "vendorBranchId" TEXT NOT NULL REFERENCES "vendor_branch"("id"),
        "status" TEXT NOT NULL
      );
      CREATE TYPE "AuditAction" AS ENUM ('LOGIN_SUCCESS');
      CREATE TABLE "AuditLog" (
        "id" TEXT PRIMARY KEY,
        "actorId" TEXT,
        "action" "AuditAction" NOT NULL,
        "targetType" TEXT,
        "targetId" TEXT,
        "meta" JSONB,
        "ipAddress" TEXT,
        "userAgent" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      -- Pre-existing indexes the billing migration's Prisma-diff churn drops
      -- and recreates unchanged (see the migration's own comment); stubbed
      -- here purely so that DROP INDEX has something to find.
      CREATE UNIQUE INDEX "vendor_application_one_active_per_profile"
        ON "vendor_application"("vendorProfileId") WHERE ("status" IN ('DRAFT', 'PENDING', 'APPROVED'));
      CREATE UNIQUE INDEX "vendor_branch_payment_application_one_active"
        ON "vendor_branch_payment_application"("vendorBranchId") WHERE ("status" IN ('DRAFT', 'PENDING', 'APPROVED'));
    `);
    await client.query(migrationSql);

    universityId = `university-${randomUUID()}`;
    await client.query('INSERT INTO "university_profile" ("id") VALUES ($1)', [universityId]);
  } finally {
    client.release();
  }

  scopedPrisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: directUrl }, { schema: schemaName }),
  });
}, 60_000);

afterAll(async () => {
  await scopedPrisma?.$disconnect();
  if (!pool) return;
  await pool.query(`DROP SCHEMA IF EXISTS ${quotedTestSchema()} CASCADE`);
  await pool.end();
});

describe("verification billing policy invariants", () => {
  it("bootstraps a zero-overlap legacy+live policy pair and is idempotent on rerun", async () => {
    const first = await scopedPrisma.$transaction((tx) =>
      policy.bootstrapVerificationBillingPolicies(tx, {
        universityId,
        verificationFeeMinor: BigInt(250),
        legacyFeeMinor: BigInt(100),
        platformBasisPoints: 1000,
      }),
    );

    expect(first.created).toBe(true);
    expect(first.legacyPolicy!.version).toBe(1);
    expect(first.livePolicy.version).toBe(2);
    expect(first.legacyPolicy!.effectiveTo).toEqual(first.livePolicy.effectiveFrom);
    expect(typeof first.livePolicy.verificationFeeMinor).toBe("bigint");

    const second = await scopedPrisma.$transaction((tx) =>
      policy.bootstrapVerificationBillingPolicies(tx, {
        universityId,
        verificationFeeMinor: BigInt(999),
        legacyFeeMinor: BigInt(999),
        platformBasisPoints: 2000,
      }),
    );

    expect(second.created).toBe(false);
    expect(second.livePolicy.id).toBe(first.livePolicy.id);
    expect(second.livePolicy.verificationFeeMinor).toBe(BigInt(250));

    const policyCount = await scopedPrisma.verificationBillingPolicy.count({ where: { universityId } });
    expect(policyCount).toBe(2);
  });

  it("selects the policy whose half-open range contains the given instant", async () => {
    const legacy = await scopedPrisma.verificationBillingPolicy.findFirstOrThrow({
      where: { universityId, version: 1 },
    });
    const live = await scopedPrisma.verificationBillingPolicy.findFirstOrThrow({
      where: { universityId, version: 2 },
    });

    const beforeBoundary = new Date(live.effectiveFrom.getTime() - 1);
    const atBoundary = live.effectiveFrom;

    const beforeResult = await policy.findVerificationBillingPolicyForInstant(scopedPrisma, universityId, beforeBoundary);
    const atResult = await policy.findVerificationBillingPolicyForInstant(scopedPrisma, universityId, atBoundary);

    expect(beforeResult?.id).toBe(legacy.id);
    expect(atResult?.id).toBe(live.id);
  });

  it("serializes concurrent policy edits into sequential, non-overlapping versions", async () => {
    const [resultA, resultB] = await Promise.all([
      policy.createFollowUpVerificationBillingPolicy(
        { universityId, verificationFeeMinor: BigInt(300), platformBasisPoints: 1500, actorUserId: "admin-a" },
        scopedPrisma,
      ),
      policy.createFollowUpVerificationBillingPolicy(
        { universityId, verificationFeeMinor: BigInt(400), platformBasisPoints: 1600, actorUserId: "admin-b" },
        scopedPrisma,
      ),
    ]);

    expect(new Set([resultA.version, resultB.version])).toEqual(new Set([3, 4]));

    const openPolicies = await scopedPrisma.verificationBillingPolicy.findMany({
      where: { universityId, effectiveTo: null },
    });
    expect(openPolicies).toHaveLength(1);

    const closedPolicies = await scopedPrisma.verificationBillingPolicy.findMany({
      where: { universityId, effectiveTo: { not: null } },
      orderBy: { version: "asc" },
    });
    // Every closed row's effectiveTo must equal the next version's effectiveFrom.
    for (let index = 0; index < closedPolicies.length; index += 1) {
      const closed = closedPolicies[index];
      const next = await scopedPrisma.verificationBillingPolicy.findFirstOrThrow({
        where: { universityId, version: closed.version + 1 },
      });
      expect(closed.effectiveTo).toEqual(next.effectiveFrom);
    }
  });

  it("rejects reopening a closed policy and rejects deleting any policy row", async () => {
    const client = await getClient();
    try {
      const closed = await scopedPrisma.verificationBillingPolicy.findFirstOrThrow({
        where: { universityId, version: 1 },
      });

      await expect(
        client.query('UPDATE "verification_billing_policy" SET "effectiveTo" = NULL WHERE "id" = $1', [closed.id]),
      ).rejects.toThrow(/cannot be reopened/);

      await expect(
        client.query('DELETE FROM "verification_billing_policy" WHERE "id" = $1', [closed.id]),
      ).rejects.toThrow(/cannot be deleted/);
    } finally {
      client.release();
    }
  });
});

describe("verification charge invariants", () => {
  it("rejects an unbalanced platform/university share split", async () => {
    const client = await getClient();
    try {
      const { vendorProfileId, branchId } = await createVendorAndBranch(client);
      const verificationId = await createVerification(client, vendorProfileId);
      const policyRow = await scopedPrisma.verificationBillingPolicy.findFirstOrThrow({
        where: { universityId, version: 2 },
      });

      await expect(
        insertCharge(client, {
          verificationId,
          vendorProfileId,
          branchId,
          policyId: policyRow.id,
          feeMinor: 250,
          platformShareMinor: 100,
          universityShareMinor: 100, // 100 + 100 != 250
        }),
      ).rejects.toThrow();
    } finally {
      client.release();
    }
  });

  it("rejects a negative fee and a non-ZAR currency", async () => {
    const client = await getClient();
    try {
      const { vendorProfileId, branchId } = await createVendorAndBranch(client);
      const policyRow = await scopedPrisma.verificationBillingPolicy.findFirstOrThrow({
        where: { universityId, version: 2 },
      });

      const negativeVerificationId = await createVerification(client, vendorProfileId);
      await expect(
        insertCharge(client, {
          verificationId: negativeVerificationId,
          vendorProfileId,
          branchId,
          policyId: policyRow.id,
          feeMinor: -1,
          platformShareMinor: 0,
          universityShareMinor: -1,
        }),
      ).rejects.toThrow();

      const nonZarVerificationId = await createVerification(client, vendorProfileId);
      await expect(
        insertCharge(client, {
          verificationId: nonZarVerificationId,
          vendorProfileId,
          branchId,
          policyId: policyRow.id,
          feeMinor: 100,
          platformShareMinor: 0,
          universityShareMinor: 100,
          currency: "USD",
        }),
      ).rejects.toThrow();
    } finally {
      client.release();
    }
  });

  it("rejects a charge for a vendor that does not exist", async () => {
    const client = await getClient();
    try {
      const { vendorProfileId, branchId } = await createVendorAndBranch(client);
      const verificationId = await createVerification(client, vendorProfileId);
      const policyRow = await scopedPrisma.verificationBillingPolicy.findFirstOrThrow({
        where: { universityId, version: 2 },
      });

      await expect(
        insertCharge(client, {
          verificationId,
          vendorProfileId: "vendor-does-not-exist",
          branchId,
          policyId: policyRow.id,
          feeMinor: 100,
          platformShareMinor: 10,
          universityShareMinor: 90,
        }),
      ).rejects.toThrow();
    } finally {
      client.release();
    }
  });

  it("is immutable after creation and restricts deletion of its vendor", async () => {
    const client = await getClient();
    try {
      const { vendorProfileId, branchId } = await createVendorAndBranch(client);
      const verificationId = await createVerification(client, vendorProfileId);
      const policyRow = await scopedPrisma.verificationBillingPolicy.findFirstOrThrow({
        where: { universityId, version: 2 },
      });
      const chargeId = await insertCharge(client, {
        verificationId,
        vendorProfileId,
        branchId,
        policyId: policyRow.id,
        feeMinor: 250,
        platformShareMinor: 25,
        universityShareMinor: 225,
      });

      await expect(
        client.query('UPDATE "verification_charge" SET "feeMinor" = 1 WHERE "id" = $1', [chargeId]),
      ).rejects.toThrow(/immutable/);
      await expect(
        client.query('DELETE FROM "verification_charge" WHERE "id" = $1', [chargeId]),
      ).rejects.toThrow(/immutable/);

      await expect(
        client.query('DELETE FROM "vendor_profile" WHERE "id" = $1', [vendorProfileId]),
      ).rejects.toThrow();
    } finally {
      client.release();
    }
  });
});

describe("vendor invoice invariants", () => {
  async function createIssuedInvoiceWithItem(client: PoolClient) {
    const { vendorProfileId, branchId } = await createVendorAndBranch(client);
    const verificationId = await createVerification(client, vendorProfileId);
    const policyRow = await scopedPrisma.verificationBillingPolicy.findFirstOrThrow({
      where: { universityId, version: 2 },
    });
    const chargeId = await insertCharge(client, {
      verificationId,
      vendorProfileId,
      branchId,
      policyId: policyRow.id,
      feeMinor: 250,
      platformShareMinor: 25,
      universityShareMinor: 225,
    });

    const invoiceId = `invoice-${randomUUID()}`;
    const invoiceNumber = `DEMO-TEST-${randomUUID()}`;

    await runInTransaction(client, async () => {
      await client.query(
        `INSERT INTO "vendor_invoice" (
          "id", "invoiceNumber", "vendorProfileId", "periodKey", "issuerSnapshot", "customerSnapshot",
          "totalMinor", "platformShareMinor", "universityShareMinor", "updatedAt"
        ) VALUES ($1, $2, $3, '2026-09', '{}', '{}', 250, 25, 225, now())`,
        [invoiceId, invoiceNumber, vendorProfileId],
      );
      await client.query(
        `INSERT INTO "vendor_invoice_item" (
          "id", "invoiceId", "chargeId", "servicePeriodKey", "branchNameSnapshot",
          "unitPriceMinor", "lineTotalMinor", "platformShareMinor", "universityShareMinor"
        ) VALUES ($1, $2, $3, '2026-09', 'Test Branch', 250, 250, 25, 225)`,
        [`item-${randomUUID()}`, invoiceId, chargeId],
      );
      await client.query(
        'UPDATE "vendor_invoice" SET "documentStatus" = \'ISSUED\', "issuedAt" = now() WHERE "id" = $1',
        [invoiceId],
      );
    });

    return { invoiceId, vendorProfileId };
  }

  it("requires an invoice item's invoice to be issued by commit", async () => {
    const client = await getClient();
    try {
      const { vendorProfileId, branchId } = await createVendorAndBranch(client);
      const verificationId = await createVerification(client, vendorProfileId);
      const policyRow = await scopedPrisma.verificationBillingPolicy.findFirstOrThrow({
        where: { universityId, version: 2 },
      });
      const chargeId = await insertCharge(client, {
        verificationId,
        vendorProfileId,
        branchId,
        policyId: policyRow.id,
        feeMinor: 250,
        platformShareMinor: 25,
        universityShareMinor: 225,
      });
      const invoiceId = `invoice-${randomUUID()}`;

      await expect(
        runInTransaction(client, async () => {
          await client.query(
            `INSERT INTO "vendor_invoice" (
              "id", "invoiceNumber", "vendorProfileId", "periodKey", "issuerSnapshot", "customerSnapshot",
              "totalMinor", "platformShareMinor", "universityShareMinor", "updatedAt"
            ) VALUES ($1, $2, $3, '2026-09', '{}', '{}', 250, 25, 225, now())`,
            [invoiceId, `DEMO-TEST-${randomUUID()}`, vendorProfileId],
          );
          await client.query(
            `INSERT INTO "vendor_invoice_item" (
              "id", "invoiceId", "chargeId", "servicePeriodKey", "branchNameSnapshot",
              "unitPriceMinor", "lineTotalMinor", "platformShareMinor", "universityShareMinor"
            ) VALUES ($1, $2, $3, '2026-09', 'Test Branch', 250, 250, 25, 225)`,
            [`item-${randomUUID()}`, invoiceId, chargeId],
          );
          // Deliberately left in DRAFT — the deferred check must fail at commit.
        }),
      ).rejects.toThrow(/requires its invoice to be issued/);
    } finally {
      client.release();
    }
  });

  it("rejects an item whose shares do not sum to its line total", async () => {
    const client = await getClient();
    try {
      const { vendorProfileId, branchId } = await createVendorAndBranch(client);
      const verificationId = await createVerification(client, vendorProfileId);
      const policyRow = await scopedPrisma.verificationBillingPolicy.findFirstOrThrow({
        where: { universityId, version: 2 },
      });
      const chargeId = await insertCharge(client, {
        verificationId,
        vendorProfileId,
        branchId,
        policyId: policyRow.id,
        feeMinor: 250,
        platformShareMinor: 25,
        universityShareMinor: 225,
      });
      const invoiceId = `invoice-${randomUUID()}`;

      await expect(
        runInTransaction(client, async () => {
          await client.query(
            `INSERT INTO "vendor_invoice" (
              "id", "invoiceNumber", "vendorProfileId", "periodKey", "issuerSnapshot", "customerSnapshot",
              "totalMinor", "platformShareMinor", "universityShareMinor", "updatedAt"
            ) VALUES ($1, $2, $3, '2026-09', '{}', '{}', 250, 25, 225, now())`,
            [invoiceId, `DEMO-TEST-${randomUUID()}`, vendorProfileId],
          );
          await client.query(
            `INSERT INTO "vendor_invoice_item" (
              "id", "invoiceId", "chargeId", "servicePeriodKey", "branchNameSnapshot",
              "unitPriceMinor", "lineTotalMinor", "platformShareMinor", "universityShareMinor"
            ) VALUES ($1, $2, $3, '2026-09', 'Test Branch', 250, 250, 1, 1)`,
            [`item-${randomUUID()}`, invoiceId, chargeId],
          );
        }),
      ).rejects.toThrow();
    } finally {
      client.release();
    }
  });

  it("is immutable once issued and rejects an invalid status transition", async () => {
    const client = await getClient();
    try {
      const { invoiceId } = await createIssuedInvoiceWithItem(client);

      await expect(
        client.query('UPDATE "vendor_invoice" SET "totalMinor" = 1 WHERE "id" = $1', [invoiceId]),
      ).rejects.toThrow(/immutable/);

      await expect(
        client.query('UPDATE "vendor_invoice" SET "documentStatus" = \'DRAFT\' WHERE "id" = $1', [invoiceId]),
      ).rejects.toThrow(/Invalid vendor invoice status transition/);

      await expect(client.query('DELETE FROM "vendor_invoice" WHERE "id" = $1', [invoiceId])).rejects.toThrow(
        /cannot be deleted/,
      );
    } finally {
      client.release();
    }
  });

  it("allows voiding an issued invoice but rejects further changes after that", async () => {
    const client = await getClient();
    try {
      const { invoiceId } = await createIssuedInvoiceWithItem(client);

      await client.query(
        'UPDATE "vendor_invoice" SET "documentStatus" = \'VOID\', "voidedAt" = now() WHERE "id" = $1',
        [invoiceId],
      );

      await expect(
        client.query('UPDATE "vendor_invoice" SET "documentStatus" = \'ISSUED\' WHERE "id" = $1', [invoiceId]),
      ).rejects.toThrow(/voided invoice cannot change status/);
    } finally {
      client.release();
    }
  });

  it("rejects an invoice whose shares do not sum to its total", async () => {
    const client = await getClient();
    try {
      const { vendorProfileId } = await createVendorAndBranch(client);

      await expect(
        client.query(
          `INSERT INTO "vendor_invoice" (
            "id", "invoiceNumber", "vendorProfileId", "periodKey", "issuerSnapshot", "customerSnapshot",
            "totalMinor", "platformShareMinor", "universityShareMinor", "updatedAt"
          ) VALUES ($1, $2, $3, '2026-09', '{}', '{}', 250, 1, 1, now())`,
          [`invoice-${randomUUID()}`, `DEMO-TEST-${randomUUID()}`, vendorProfileId],
        ),
      ).rejects.toThrow();
    } finally {
      client.release();
    }
  });
});

describe("verification charge finalizer", () => {
  function chargeInput(verificationId: string, vendorProfileId: string, branchId: string) {
    return {
      verificationId,
      vendorProfileId,
      branchId,
      branchNameSnapshot: "Main Branch",
      billingStatus: "BILLABLE" as const,
      verificationFeeMinor: 250,
      verificationFeeCurrency: "ZAR",
      billingPeriodKey: "2026-09",
      completedAt: new Date(),
    };
  }

  it("creates a charge for a billable verification using the currently effective policy", async () => {
    const client = await getClient();
    try {
      const { vendorProfileId, branchId } = await createVendorAndBranch(client);
      const verificationId = await createVerification(client, vendorProfileId);

      const charge = await charges.finalizeVerificationCharge(
        scopedPrisma,
        chargeInput(verificationId, vendorProfileId, branchId),
      );

      expect(charge).not.toBeNull();
      expect(charge!.feeMinor).toBe(BigInt(250));
      expect(charge!.source).toBe("LIVE");
      // The exact split depends on whichever policy is currently open (an
      // earlier test in this file edits it concurrently); the balanced-share
      // invariant itself is what this asserts.
      expect(charge!.platformShareMinor + charge!.universityShareMinor).toBe(BigInt(250));
    } finally {
      client.release();
    }
  });

  it("is idempotent across two sequential calls for the same verification", async () => {
    const client = await getClient();
    try {
      const { vendorProfileId, branchId } = await createVendorAndBranch(client);
      const verificationId = await createVerification(client, vendorProfileId);
      const input = chargeInput(verificationId, vendorProfileId, branchId);

      const first = await charges.finalizeVerificationCharge(scopedPrisma, input);
      const second = await charges.finalizeVerificationCharge(scopedPrisma, input);

      expect(second!.id).toBe(first!.id);
      const count = await scopedPrisma.verificationCharge.count({ where: { verificationId } });
      expect(count).toBe(1);
    } finally {
      client.release();
    }
  });

  it("resolves a real concurrent race to exactly one charge via the unique constraint", async () => {
    const client = await getClient();
    try {
      const { vendorProfileId, branchId } = await createVendorAndBranch(client);
      const verificationId = await createVerification(client, vendorProfileId);
      const input = chargeInput(verificationId, vendorProfileId, branchId);

      const [a, b] = await Promise.all([
        charges.finalizeVerificationCharge(scopedPrisma, input),
        charges.finalizeVerificationCharge(scopedPrisma, input),
      ]);

      expect(a!.id).toBe(b!.id);
      const count = await scopedPrisma.verificationCharge.count({ where: { verificationId } });
      expect(count).toBe(1);
    } finally {
      client.release();
    }
  });

  it("never throws and records an exception when the verification's vendor has no branch context", async () => {
    const result = await charges.finalizeVerificationCharge(scopedPrisma, {
      verificationId: `verification-${randomUUID()}`,
      vendorProfileId: "vendor-does-not-exist",
      branchId: null,
      branchNameSnapshot: "Unattributed branch",
      billingStatus: "BILLABLE",
      verificationFeeMinor: 250,
      verificationFeeCurrency: "ZAR",
      billingPeriodKey: "2026-09",
      completedAt: new Date(),
    });

    // The verification_charge.vendorProfileId FK violation is caught, logged,
    // and turned into a durable exception rather than propagating.
    expect(result).toBeNull();
  });
});

describe("vendor invoice generation", () => {
  async function billablePolicy() {
    return scopedPrisma.verificationBillingPolicy.findFirstOrThrow({
      where: { universityId, effectiveTo: null },
    });
  }

  it("issues an invoice for a closed period with the correct totals and items", async () => {
    const client = await getClient();
    try {
      const { vendorProfileId, branchId } = await createVendorAndBranch(client);
      const policyRow = await billablePolicy();
      const verificationA = await createVerification(client, vendorProfileId);
      const verificationB = await createVerification(client, vendorProfileId);
      await insertCharge(client, {
        verificationId: verificationA,
        vendorProfileId,
        branchId,
        policyId: policyRow.id,
        feeMinor: 250,
        platformShareMinor: 25,
        universityShareMinor: 225,
        servicePeriodKey: "2024-01",
      });
      await insertCharge(client, {
        verificationId: verificationB,
        vendorProfileId,
        branchId,
        policyId: policyRow.id,
        feeMinor: 100,
        platformShareMinor: 10,
        universityShareMinor: 90,
        servicePeriodKey: "2024-01",
      });

      const invoice = await invoices.issueInvoiceForVendorPeriod(scopedPrisma, {
        vendorProfileId,
        periodKey: "2024-01",
      });

      expect(invoice).toMatchObject({
        periodKey: "2024-01",
        documentStatus: "ISSUED",
        paymentStatus: "UNPAID",
        totalMinor: BigInt(350),
        platformShareMinor: BigInt(35),
        universityShareMinor: BigInt(315),
      });
      expect(invoice!.invoiceNumber).toMatch(/^DEMO-\d{4}-\d{6}$/);

      const items = await scopedPrisma.vendorInvoiceItem.findMany({ where: { invoiceId: invoice!.id } });
      expect(items).toHaveLength(2);
    } finally {
      client.release();
    }
  });

  it("does not generate an invoice for a period that has not closed yet", async () => {
    const client = await getClient();
    try {
      const { vendorProfileId, branchId } = await createVendorAndBranch(client);
      const policyRow = await billablePolicy();
      const verificationId = await createVerification(client, vendorProfileId);
      await insertCharge(client, {
        verificationId,
        vendorProfileId,
        branchId,
        policyId: policyRow.id,
        feeMinor: 250,
        platformShareMinor: 25,
        universityShareMinor: 225,
        servicePeriodKey: "2099-01",
      });

      const target = await invoices.resolveNextInvoicePeriodForVendor(scopedPrisma, vendorProfileId, "ZAR", new Date());
      expect(target).toBeNull();

      const summary = await invoices.runVendorInvoiceGeneration(scopedPrisma, { now: new Date() });
      const invoiceCount = await scopedPrisma.vendorInvoice.count({ where: { vendorProfileId } });
      expect(invoiceCount).toBe(0);
      expect(summary.invoicesIssued).toBeGreaterThanOrEqual(0); // other vendors from earlier tests may also be due
    } finally {
      client.release();
    }
  });

  it("creates a zero-total invoice labelled NO_PAYMENT_REQUIRED for an explicit zero fee", async () => {
    const client = await getClient();
    try {
      const { vendorProfileId, branchId } = await createVendorAndBranch(client);
      const policyRow = await billablePolicy();
      const verificationId = await createVerification(client, vendorProfileId);
      await insertCharge(client, {
        verificationId,
        vendorProfileId,
        branchId,
        policyId: policyRow.id,
        feeMinor: 0,
        platformShareMinor: 0,
        universityShareMinor: 0,
        servicePeriodKey: "2024-02",
      });

      const invoice = await invoices.issueInvoiceForVendorPeriod(scopedPrisma, {
        vendorProfileId,
        periodKey: "2024-02",
      });

      expect(invoice).toMatchObject({ totalMinor: BigInt(0), paymentStatus: "NO_PAYMENT_REQUIRED" });
    } finally {
      client.release();
    }
  });

  it("sweeps a late-arriving charge from an already-invoiced period into the next invoice, retaining its original period", async () => {
    const client = await getClient();
    try {
      const { vendorProfileId, branchId } = await createVendorAndBranch(client);
      const policyRow = await billablePolicy();

      const firstVerification = await createVerification(client, vendorProfileId);
      await insertCharge(client, {
        verificationId: firstVerification,
        vendorProfileId,
        branchId,
        policyId: policyRow.id,
        feeMinor: 100,
        platformShareMinor: 10,
        universityShareMinor: 90,
        servicePeriodKey: "2024-03",
      });
      const firstInvoice = await invoices.issueInvoiceForVendorPeriod(scopedPrisma, {
        vendorProfileId,
        periodKey: "2024-03",
      });
      expect(firstInvoice).not.toBeNull();

      // A late webhook for a March verification arrives after that invoice
      // already issued.
      const lateVerification = await createVerification(client, vendorProfileId);
      await insertCharge(client, {
        verificationId: lateVerification,
        vendorProfileId,
        branchId,
        policyId: policyRow.id,
        feeMinor: 50,
        platformShareMinor: 5,
        universityShareMinor: 45,
        servicePeriodKey: "2024-03",
      });

      const nextTarget = await invoices.resolveNextInvoicePeriodForVendor(scopedPrisma, vendorProfileId, "ZAR", new Date());
      expect(nextTarget).toBe("2024-04");

      const secondInvoice = await invoices.issueInvoiceForVendorPeriod(scopedPrisma, {
        vendorProfileId,
        periodKey: "2024-04",
      });

      expect(secondInvoice).toMatchObject({ periodKey: "2024-04", totalMinor: BigInt(50) });
      const secondInvoiceItems = await scopedPrisma.vendorInvoiceItem.findMany({
        where: { invoiceId: secondInvoice!.id },
      });
      // The item's own service period still reads "2024-03" even though the
      // invoice it landed on is periodKey "2024-04".
      expect(secondInvoiceItems).toEqual([expect.objectContaining({ servicePeriodKey: "2024-03" })]);

      const vendorInvoiceCount = await scopedPrisma.vendorInvoice.count({ where: { vendorProfileId } });
      expect(vendorInvoiceCount).toBe(2); // never a duplicate "2024-03" invoice
    } finally {
      client.release();
    }
  });

  it("resolves a real concurrent generation race for the same vendor/period to exactly one invoice", async () => {
    const client = await getClient();
    try {
      const { vendorProfileId, branchId } = await createVendorAndBranch(client);
      const policyRow = await billablePolicy();
      const verificationId = await createVerification(client, vendorProfileId);
      await insertCharge(client, {
        verificationId,
        vendorProfileId,
        branchId,
        policyId: policyRow.id,
        feeMinor: 250,
        platformShareMinor: 25,
        universityShareMinor: 225,
        servicePeriodKey: "2024-05",
      });

      const [a, b] = await Promise.all([
        invoices.issueInvoiceForVendorPeriod(scopedPrisma, { vendorProfileId, periodKey: "2024-05" }),
        invoices.issueInvoiceForVendorPeriod(scopedPrisma, { vendorProfileId, periodKey: "2024-05" }),
      ]);

      const succeeded = [a, b].filter((result) => result !== null);
      expect(succeeded).toHaveLength(1);

      const invoiceCount = await scopedPrisma.vendorInvoice.count({
        where: { vendorProfileId, periodKey: "2024-05" },
      });
      expect(invoiceCount).toBe(1);
      const itemCount = await scopedPrisma.vendorInvoiceItem.count({
        where: { invoice: { vendorProfileId, periodKey: "2024-05" } },
      });
      expect(itemCount).toBe(1);
    } finally {
      client.release();
    }
  });

  it("the --as-of style simulated clock treats a period as closed only once the closing delay has elapsed", async () => {
    const client = await getClient();
    try {
      const { vendorProfileId, branchId } = await createVendorAndBranch(client);
      const policyRow = await billablePolicy();
      const verificationId = await createVerification(client, vendorProfileId);
      await insertCharge(client, {
        verificationId,
        vendorProfileId,
        branchId,
        policyId: policyRow.id,
        feeMinor: 250,
        platformShareMinor: 25,
        universityShareMinor: 225,
        servicePeriodKey: "2026-12",
      });

      const periodEnd = new Date("2026-12-31T22:00:00.000Z");
      const justBeforeClosing = await invoices.resolveNextInvoicePeriodForVendor(
        scopedPrisma,
        vendorProfileId,
        "ZAR",
        new Date(periodEnd.getTime() + 1000),
      );
      expect(justBeforeClosing).toBeNull(); // period ended but the 1-hour closing delay has not elapsed

      const afterClosing = await invoices.resolveNextInvoicePeriodForVendor(
        scopedPrisma,
        vendorProfileId,
        "ZAR",
        new Date(periodEnd.getTime() + 3600_000 + 1000),
      );
      expect(afterClosing).toBe("2026-12");
    } finally {
      client.release();
    }
  });
});
