// @vitest-environment node
// External funder top-ups against the migrated database, with Paystack and email mocked.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/config/env", () => ({ env: { APP_URL: "http://localhost:3000", DATABASE_URL: process.env.DATABASE_URL, PAYMENT_WALLET_TOPUPS_ENABLED: true, PAYMENT_TOPUP_MIN_MINOR: 1_000, PAYMENT_TOPUP_MAX_MINOR: 500_000, PAYMENT_OTP_PEPPER: "integration-only-pepper-integration-only" } }));
const paystack = vi.hoisted(() => ({ initializeTopupTransaction: vi.fn(), verifyTransaction: vi.fn() }));
vi.mock("@/lib/paymentProviders/paystack/client", () => paystack);
const CONFIG = { secretKey: "sk_test_fixture", mode: "test", accountRef: "funder-topup-test", expectedIntegrationId: "1", baseUrl: "https://api.paystack.example" };
vi.mock("@/lib/paymentProviders/paystack/config", () => ({ resolvePaystackWalletTopupConfig: () => CONFIG }));
const email = vi.hoisted(() => ({ sendFunderTopupReceivedEmail: vi.fn(async () => ({ provider: "console" })) }));
vi.mock("@/lib/email/funder-topup", () => email);
import { prisma } from "@/lib/db/prisma";
import { createFunderTopup, getFunderTopup, reconcileWalletTopupByReference } from "@/lib/payments/topups";
import { listMobileWalletActivity } from "@/lib/payments/walletMobile";
import { ensurePaymentTestUniversity } from "./paymentTestUniversity";

beforeAll(async () => {
  await ensurePaymentTestUniversity();
  await prisma.walletAccount.upsert({ where: { systemCode: "GATEWAY_CLEARING" }, create: { type: "SYSTEM", currency: "ZAR", systemCode: "GATEWAY_CLEARING" }, update: {} });
});
afterAll(async () => { await prisma.$disconnect(); });
beforeEach(() => {
  vi.clearAllMocks();
  paystack.initializeTopupTransaction.mockImplementation(async (_key, _url, input) => ({ authorizationUrl: `https://checkout.example/${input.reference}`, accessCode: "access", reference: input.reference }));
});

describe("External funder top-ups in PostgreSQL", () => {
  it("funds a student with no wallet yet, credits once via the webhook path and shows the funder in Activity", async () => {
    const suffix = randomUUID();
    // Student numbers are stored in capitals (activation upper-cases them too);
    // the funder types it in lowercase to cover the upper-cased lookup.
    const student = await prisma.student.create({ data: { studentNumber: `FUND-${suffix}`.toUpperCase(), email: `fund-${suffix}@example.invalid`, firstName: "Alex", lastName: "Example" } });

    const started = await createFunderTopup({
      studentNumber: ` ${student.studentNumber.toLowerCase()} `,
      studentSurname: " EXAMPLE ",
      funderName: "Jane Doe",
      funderEmail: "Jane.Doe@Example.invalid",
      amountMinor: 5_000,
      currency: "ZAR",
      idempotencyKey: randomUUID(),
      ipAddress: "192.0.2.44",
    });
    expect(started).toMatchObject({ status: "PENDING", amountMinor: 5_000, authorizationUrl: expect.stringContaining(started.reference) });
    expect(paystack.initializeTopupTransaction).toHaveBeenCalledWith(CONFIG.secretKey, CONFIG.baseUrl, expect.objectContaining({
      email: "jane.doe@example.invalid",
      callbackUrl: expect.stringContaining("/fund/return?topUpId="),
      metadata: expect.objectContaining({ purpose: "funder_wallet_topup" }),
    }));

    const stored = await prisma.walletTopupAttempt.findUniqueOrThrow({ where: { id: started.topUpId } });
    expect(stored).toMatchObject({ sessionId: null, funderName: "Jane Doe", funderEmail: "jane.doe@example.invalid", funderIpHash: expect.stringMatching(/^[0-9a-f]{64}$/) });
    const account = await prisma.walletAccount.findUniqueOrThrow({ where: { studentId: student.id }, include: { balance: true } });
    expect(account.balance?.postedBalanceMinor).toBe(BigInt(0));

    // Abandoned/pending funder attempts never reach the student's Activity.
    expect(await listMobileWalletActivity(student.id)).toEqual([]);

    paystack.verifyTransaction.mockResolvedValue({ providerTransactionId: randomUUID(), reference: started.reference, status: "success", amountMinor: BigInt(5_000), currency: "ZAR", domain: "test", paidAtIso: null });
    await Promise.all([
      reconcileWalletTopupByReference({ reference: started.reference, config: CONFIG }),
      reconcileWalletTopupByReference({ reference: started.reference, config: CONFIG }),
    ]);

    const balance = await prisma.walletAccountBalance.findUniqueOrThrow({ where: { accountId: account.id } });
    expect(balance.postedBalanceMinor).toBe(BigInt(5_000));
    await expect(getFunderTopup({ topUpId: started.topUpId, reference: started.reference })).resolves.toMatchObject({ status: "SUCCEEDED" });
    expect(email.sendFunderTopupReceivedEmail).toHaveBeenCalledTimes(1);
    expect(email.sendFunderTopupReceivedEmail).toHaveBeenCalledWith(expect.objectContaining({ to: student.email, funderName: "Jane Doe" }));

    const activity = await listMobileWalletActivity(student.id);
    expect(activity).toHaveLength(1);
    expect(activity[0]).toMatchObject({ type: "TOPUP", title: "From Jane Doe", funderName: "Jane Doe", amountMinor: 5_000, subtitle: started.reference });
  });
});
