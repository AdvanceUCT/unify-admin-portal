import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type AttemptRow = {
  id: string;
  walletTransactionId: string;
  studentId: string;
  sessionId: string | null;
  provider: string;
  providerAccountRef: string;
  providerMode: string;
  reference: string;
  authorizationUrl: string | null;
  amountMinor: bigint;
  currency: string;
  idempotencyKey: string;
  status: "PENDING" | "SUCCEEDED" | "FAILED" | "UNKNOWN";
  failureCode: string | null;
  completedAt: Date | null;
  funderName: string | null;
  funderEmail: string | null;
  funderIpHash: string | null;
  createdAt: Date;
  walletTransaction: { status: "PENDING" | "COMPLETED" | "FAILED"; completedAt: Date | null; initiatorAccountId: string };
  student: { email: string; firstName: string; lastName: string; walletAccount: { balance: { postedBalanceMinor: bigint } } };
};

const store = vi.hoisted(() => ({ attempts: [] as AttemptRow[] }));
const database = vi.hoisted(() => ({
  $transaction: vi.fn(),
  universityProfile: { findMany: vi.fn() },
  student: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn() },
  walletAccount: { findUnique: vi.fn() },
  walletAccountBalance: { findFirst: vi.fn() },
  walletTransaction: { create: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
  walletTopupAttempt: {
    count: vi.fn(),
    create: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  ledgerEntry: { findMany: vi.fn() },
}));
const paystack = vi.hoisted(() => ({ initializeTopupTransaction: vi.fn(), verifyTransaction: vi.fn() }));
const sendFunderTopupReceivedEmail = vi.hoisted(() => vi.fn());
const ensureStudentWalletAccount = vi.hoisted(() => vi.fn());
const completePendingTopup = vi.hoisted(() => vi.fn());

const PEPPER = "ci-only-pepper-ci-only-pepper-ci-only";
const CONFIG = { secretKey: "sk_test_fixture", mode: "test", accountRef: "wallet-topup-test", expectedIntegrationId: "1", baseUrl: "https://api.paystack.example" };

vi.mock("@/lib/db/prisma", () => ({ prisma: database }));
vi.mock("@/lib/config/env", () => ({
  env: {
    APP_URL: "https://portal.example.test",
    PAYMENT_WALLET_TOPUPS_ENABLED: true,
    PAYMENT_TOPUP_MIN_MINOR: 1_000,
    PAYMENT_TOPUP_MAX_MINOR: 500_000,
    PAYMENT_OTP_PEPPER: "ci-only-pepper-ci-only-pepper-ci-only",
  },
}));
vi.mock("@/lib/paymentProviders/paystack/client", () => paystack);
vi.mock("@/lib/paymentProviders/paystack/config", () => ({ resolvePaystackWalletTopupConfig: () => CONFIG }));
vi.mock("@/lib/payments/accounts", () => ({ ensureStudentWalletAccount }));
vi.mock("@/lib/payments/posting", () => ({ completePendingTopup }));
vi.mock("@/lib/email/funder-topup", () => ({ sendFunderTopupReceivedEmail }));

import { POST as reconcileRoute } from "@/app/api/fund/topups/reconcile/route";
import { POST as statusRoute } from "@/app/api/fund/topups/status/route";
import { fundErrorKeyFor, fundErrorMessage } from "@/app/(public)/fund/fundErrors";
import { WalletDomainError } from "@/lib/payments/errors";
import { createFunderTopup, getFunderTopup, reconcileFunderTopup } from "@/lib/payments/topups";
import { listMobileWalletActivity } from "@/lib/payments/walletMobile";

const NOT_ELIGIBLE_MESSAGE = "We couldn't accept funding for that student. Check the student number and surname.";
const FUNDER_RESULT_KEYS = ["topUpId", "reference", "status", "authorizationUrl", "amountMinor", "currency", "completedAt", "failureCode"];
const now = new Date("2026-10-12T10:00:00.000Z");
const studentRecord = { id: "student-1", lastName: "van der  Merwe" };
const baseInput = {
  studentNumber: " 2026001 ",
  studentSurname: "van der Merwe",
  funderName: "Jane Doe",
  funderEmail: " Jane.Doe@Example.TEST ",
  amountMinor: 5_000,
  currency: "ZAR" as const,
  idempotencyKey: "funder-key-1",
  ipAddress: "192.0.2.10",
  now,
};
const ipHash = createHmac("sha256", PEPPER).update("ip:192.0.2.10").digest("hex");

let accountStatus: "ACTIVE" | "SUSPENDED" | "CLOSED";
let ipAttemptCount: number;
let studentOpenAttemptCount: number;

function clone<T>(value: T): T {
  return structuredClone(value);
}

function makeAttempt(overrides: Partial<AttemptRow> = {}): AttemptRow {
  return {
    id: "topup-1",
    walletTransactionId: "wt-1",
    studentId: "student-1",
    sessionId: null,
    provider: "PAYSTACK",
    providerAccountRef: CONFIG.accountRef,
    providerMode: CONFIG.mode,
    reference: "unify-wlt-0123456789abcdef0123",
    authorizationUrl: "https://checkout.example/unify-wlt-0123456789abcdef0123",
    amountMinor: BigInt(5_000),
    currency: "ZAR",
    idempotencyKey: "funder-key-1",
    status: "PENDING",
    failureCode: null,
    completedAt: null,
    funderName: "Jane Doe",
    funderEmail: "jane.doe@example.test",
    funderIpHash: ipHash,
    createdAt: now,
    walletTransaction: { status: "PENDING", completedAt: null, initiatorAccountId: "wallet-1" },
    student: { email: "student@example.test", firstName: "Alex", lastName: "Example", walletAccount: { balance: { postedBalanceMinor: BigInt(123_456) } } },
    ...overrides,
  };
}

function matches(row: AttemptRow, where: Record<string, unknown>) {
  for (const [key, condition] of Object.entries(where)) {
    const value = row[key as keyof AttemptRow];
    if (key === "walletTransaction") continue;
    if (condition && typeof condition === "object" && "not" in condition) {
      if (value === (condition as { not: unknown }).not) return false;
    } else if (value !== condition) {
      return false;
    }
  }
  return true;
}

beforeEach(() => {
  vi.clearAllMocks();
  store.attempts = [];
  accountStatus = "ACTIVE";
  ipAttemptCount = 0;
  studentOpenAttemptCount = 0;

  database.$transaction.mockImplementation(async (operation: unknown) =>
    typeof operation === "function" ? operation(database) : Promise.all(operation as Promise<unknown>[]));
  database.universityProfile.findMany.mockResolvedValue([{ paymentWalletEnabled: true }]);
  database.student.findUnique.mockResolvedValue(studentRecord);
  database.student.findUniqueOrThrow.mockResolvedValue({ email: "student@example.test" });
  database.walletAccount.findUnique.mockImplementation(async ({ where }: { where: { studentId?: string; systemCode?: string } }) =>
    where.systemCode ? { id: "gateway" } : { id: "wallet-1", status: accountStatus, currency: "ZAR" });
  database.walletAccountBalance.findFirst.mockResolvedValue({ postedBalanceMinor: BigInt(123_456) });
  database.walletTransaction.create.mockResolvedValue({ id: "wt-1" });
  database.walletTransaction.update.mockResolvedValue({});
  database.walletTransaction.findUnique.mockResolvedValue({ status: "PENDING", completedAt: null });

  database.walletTopupAttempt.count.mockImplementation(async ({ where }: { where: { funderIpHash?: string } }) =>
    where.funderIpHash ? ipAttemptCount : studentOpenAttemptCount);
  database.walletTopupAttempt.findUnique.mockImplementation(async ({ where }: { where: { studentId_idempotencyKey?: { studentId: string; idempotencyKey: string } } }) => {
    const key = where.studentId_idempotencyKey;
    const row = key && store.attempts.find((attempt) => attempt.studentId === key.studentId && attempt.idempotencyKey === key.idempotencyKey);
    return row ? clone(row) : null;
  });
  database.walletTopupAttempt.create.mockImplementation(async ({ data }: { data: Partial<AttemptRow> }) => {
    const row = makeAttempt({ ...data, authorizationUrl: null, funderName: data.funderName ?? null, funderEmail: data.funderEmail ?? null, funderIpHash: data.funderIpHash ?? null });
    store.attempts.push(row);
    return clone(row);
  });
  database.walletTopupAttempt.update.mockImplementation(async ({ where, data }: { where: { id: string }; data: Partial<AttemptRow> }) => {
    const row = store.attempts.find((attempt) => attempt.id === where.id)!;
    Object.assign(row, data);
    return clone(row);
  });
  database.walletTopupAttempt.updateMany.mockImplementation(async ({ where, data }: { where: { id: string; status: { not: string } }; data: Partial<AttemptRow> }) => {
    const row = store.attempts.find((attempt) => attempt.id === where.id && attempt.status !== where.status.not);
    if (!row) return { count: 0 };
    Object.assign(row, data);
    row.walletTransaction.status = "COMPLETED";
    row.walletTransaction.completedAt = data.completedAt ?? now;
    return { count: 1 };
  });
  database.walletTopupAttempt.findFirst.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
    const row = store.attempts.find((attempt) => matches(attempt, where));
    return row ? clone(row) : null;
  });
  database.walletTopupAttempt.findUniqueOrThrow.mockImplementation(async ({ where }: { where: { id: string } }) => {
    const row = store.attempts.find((attempt) => attempt.id === where.id);
    if (!row) throw new Error("not found");
    return clone(row);
  });
  database.walletTopupAttempt.findMany.mockImplementation(async ({ where }: { where: Record<string, unknown> }) =>
    store.attempts.filter((attempt) => matches(attempt, where) && attempt.walletTransaction.status !== "COMPLETED").map(clone));

  paystack.initializeTopupTransaction.mockImplementation(async (_key: string, _url: string, input: { reference: string }) => ({
    authorizationUrl: `https://checkout.example/${input.reference}`,
    accessCode: "access-code",
    reference: input.reference,
  }));
  paystack.verifyTransaction.mockImplementation(async (_key: string, _url: string, reference: string) => ({
    providerTransactionId: "paystack-tx-1",
    reference,
    status: "success",
    amountMinor: BigInt(5_000),
    currency: "ZAR",
    domain: "test",
    paidAtIso: "2026-10-12T10:01:00.000Z",
  }));
  completePendingTopup.mockResolvedValue({});
  sendFunderTopupReceivedEmail.mockResolvedValue({ provider: "console" });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createFunderTopup", () => {
  it("stores a funder attempt and starts Paystack with the funder's email and the /fund/return callback", async () => {
    const result = await createFunderTopup(baseInput);

    const created = database.walletTopupAttempt.create.mock.calls[0][0].data;
    expect(created).toMatchObject({
      sessionId: null,
      funderName: "Jane Doe",
      funderEmail: "jane.doe@example.test",
      funderIpHash: ipHash,
      studentId: "student-1",
      amountMinor: BigInt(5_000),
    });
    expect(created.initializationFingerprint).toContain(":jane.doe@example.test");
    expect(database.student.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { studentNumber: "2026001" } }));

    const [, , init] = paystack.initializeTopupTransaction.mock.calls[0];
    expect(init.email).toBe("jane.doe@example.test");
    const callback = new URL(init.callbackUrl);
    expect(callback.origin + callback.pathname).toBe("https://portal.example.test/fund/return");
    expect(callback.searchParams.get("topUpId")).toBe(result.topUpId);
    expect(callback.searchParams.get("reference")).toBe(result.reference);
    expect(init.metadata.purpose).toBe("funder_wallet_topup");

    expect(result.reference).toMatch(/^unify-wlt-[0-9a-f]{20}$/);
    expect(result).toMatchObject({ status: "PENDING", amountMinor: 5_000, currency: "ZAR", authorizationUrl: `https://checkout.example/${result.reference}` });
  });

  it("looks the student number up in capitals, like student activation does", async () => {
    await createFunderTopup({ ...baseInput, studentNumber: " abc2026x " });
    expect(database.student.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { studentNumber: "ABC2026X" } }));
  });

  it("creates the student's wallet account on demand", async () => {
    await createFunderTopup(baseInput);
    expect(ensureStudentWalletAccount).toHaveBeenCalledWith("student-1");
  });

  it.each([
    ["unknown student number", () => database.student.findUnique.mockResolvedValue(null)],
    ["surname mismatch", () => database.student.findUnique.mockResolvedValue({ id: "student-1", lastName: "Smith" })],
    ["wallet disabled for the university", () => database.universityProfile.findMany.mockResolvedValue([{ paymentWalletEnabled: false }])],
    ["suspended wallet", () => { accountStatus = "SUSPENDED"; }],
    ["closed wallet", () => { accountStatus = "CLOSED"; }],
  ])("returns the same funder-facing error for: %s", async (_case, arrange) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    arrange();

    const error = await createFunderTopup(baseInput).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(WalletDomainError);
    expect(error).toMatchObject({ code: "FUNDING_RECIPIENT_NOT_ELIGIBLE", message: NOT_ELIGIBLE_MESSAGE });
    expect(database.walletTopupAttempt.create).not.toHaveBeenCalled();
    expect(paystack.initializeTopupTransaction).not.toHaveBeenCalled();
    // Each case is distinguishable server-side, and the log names no student details.
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).not.toMatch(/2026001|merwe|smith|jane/i);
  });

  it("logs each ineligible reason distinctly", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    database.student.findUnique.mockResolvedValueOnce(null);
    await createFunderTopup(baseInput).catch(() => undefined);
    database.student.findUnique.mockResolvedValueOnce({ id: "student-1", lastName: "Smith" });
    await createFunderTopup(baseInput).catch(() => undefined);
    accountStatus = "SUSPENDED";
    await createFunderTopup(baseInput).catch(() => undefined);

    const reasons = warn.mock.calls.map(([message]) => message);
    expect(new Set(reasons).size).toBe(3);
  });

  it("does not create a wallet account when the university has wallets disabled", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    database.universityProfile.findMany.mockResolvedValue([{ paymentWalletEnabled: false }]);
    await expect(createFunderTopup(baseInput)).rejects.toMatchObject({ code: "FUNDING_RECIPIENT_NOT_ELIGIBLE" });
    expect(ensureStudentWalletAccount).not.toHaveBeenCalled();
  });

  it.each([
    "van der merwe",
    "  VAN DER MERWE  ",
    "Van   der\tMerwe",
  ])("matches the surname ignoring case and whitespace: %j", async (studentSurname) => {
    await expect(createFunderTopup({ ...baseInput, studentSurname })).resolves.toMatchObject({ status: "PENDING" });
  });

  it("does not fuzzy-match surnames", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(createFunderTopup({ ...baseInput, studentSurname: "van der Merw" })).rejects.toMatchObject({ code: "FUNDING_RECIPIENT_NOT_ELIGIBLE" });
    await expect(createFunderTopup({ ...baseInput, studentSurname: "vanderMerwe" })).rejects.toMatchObject({ code: "FUNDING_RECIPIENT_NOT_ELIGIBLE" });
  });

  it.each([999, 500_001])("rejects amounts outside the student top-up limits: %i", async (amountMinor) => {
    await expect(createFunderTopup({ ...baseInput, amountMinor })).rejects.toMatchObject({ code: "TOPUP_AMOUNT_OUT_OF_RANGE" });
    expect(database.student.findUnique).not.toHaveBeenCalled();
  });

  it("rate limits per IP before looking up the student", async () => {
    ipAttemptCount = 10;
    await expect(createFunderTopup(baseInput)).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(database.walletTopupAttempt.count).toHaveBeenCalledWith({ where: { funderIpHash: ipHash, createdAt: { gte: new Date(now.getTime() - 600_000) } } });
    expect(database.student.findUnique).not.toHaveBeenCalled();
  });

  it("rate limits open funder attempts per student", async () => {
    studentOpenAttemptCount = 5;
    await expect(createFunderTopup(baseInput)).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(database.walletTopupAttempt.count).toHaveBeenCalledWith({
      where: {
        studentId: "student-1",
        funderEmail: { not: null },
        status: { in: ["PENDING", "UNKNOWN"] },
        createdAt: { gte: new Date(now.getTime() - 600_000) },
      },
    });
    expect(database.walletTopupAttempt.create).not.toHaveBeenCalled();
  });

  it("allows attempts just under both limits", async () => {
    ipAttemptCount = 9;
    studentOpenAttemptCount = 4;
    await expect(createFunderTopup(baseInput)).resolves.toMatchObject({ status: "PENDING" });
  });

  it("reuses the attempt for the same idempotency key and payload", async () => {
    const first = await createFunderTopup(baseInput);
    const second = await createFunderTopup(baseInput);

    expect(second.topUpId).toBe(first.topUpId);
    expect(second.reference).toBe(first.reference);
    expect(database.walletTopupAttempt.create).toHaveBeenCalledTimes(1);
    expect(paystack.initializeTopupTransaction).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["a different amount", { amountMinor: 6_000 }],
    ["a different funder email", { funderEmail: "someone.else@example.test" }],
    ["a different funder name", { funderName: "Someone Else" }],
  ])("rejects reuse of the idempotency key with %s", async (_case, change) => {
    await createFunderTopup(baseInput);
    await expect(createFunderTopup({ ...baseInput, ...change })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });

  it("rejects reuse of a student-initiated attempt's idempotency key", async () => {
    store.attempts.push(makeAttempt({ funderName: null, funderEmail: null, funderIpHash: null, sessionId: "session-1" }));
    await expect(createFunderTopup(baseInput)).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });

  it.each([
    ["a one-character name", { funderName: "J" }],
    ["a 61-character name", { funderName: "J".repeat(61) }],
    ["a name that is only control characters", { funderName: "\u0000\u0007" }],
    ["an invalid email", { funderEmail: "not-an-email" }],
  ])("rejects %s", async (_case, change) => {
    await expect(createFunderTopup({ ...baseInput, ...change })).rejects.toBeInstanceOf(WalletDomainError);
    expect(database.student.findUnique).not.toHaveBeenCalled();
  });

  it("strips control and bidi characters from the funder name before storing it", async () => {
    await createFunderTopup({ ...baseInput, funderName: "  Jane\u0000 \u202EDoe\u0007  " });
    expect(database.walletTopupAttempt.create.mock.calls[0][0].data.funderName).toBe("Jane Doe");
  });
});

describe("funder-safe results", () => {
  it("never includes the student balance, transaction id or any student attribute", async () => {
    const created = await createFunderTopup(baseInput);
    expect(Object.keys(created).every((key) => FUNDER_RESULT_KEYS.includes(key))).toBe(true);

    await reconcileFunderTopup({ topUpId: created.topUpId, reference: created.reference });
    const settled = await getFunderTopup({ topUpId: created.topUpId, reference: created.reference });

    expect(settled.status).toBe("SUCCEEDED");
    expect(Object.keys(settled).every((key) => FUNDER_RESULT_KEYS.includes(key))).toBe(true);
    expect(settled).not.toHaveProperty("resultingBalanceMinor");
    expect(settled).not.toHaveProperty("transactionId");
    expect(JSON.stringify(settled)).not.toMatch(/student|Alex|Example|123456/);
  });
});

describe("funder status and reconcile capability", () => {
  beforeEach(() => {
    store.attempts.push(
      makeAttempt(),
      makeAttempt({ id: "student-topup", walletTransactionId: "wt-2", reference: "unify-wlt-ffffffffffffffffffff", funderName: null, funderEmail: null, funderIpHash: null, sessionId: "session-1" }),
    );
  });

  it("finds a funder attempt only when topUpId and reference both match", async () => {
    await expect(getFunderTopup({ topUpId: "topup-1", reference: "unify-wlt-0123456789abcdef0123" })).resolves.toMatchObject({ topUpId: "topup-1" });
    await expect(getFunderTopup({ topUpId: "topup-1", reference: "unify-wlt-ffffffffffffffffffff" })).rejects.toMatchObject({ code: "TOPUP_NOT_FOUND" });
    await expect(reconcileFunderTopup({ topUpId: "topup-1", reference: "unify-wlt-wrong" })).rejects.toMatchObject({ code: "TOPUP_NOT_FOUND" });
    expect(paystack.verifyTransaction).not.toHaveBeenCalled();
  });

  it("rejects student-initiated attempts even with the right pair", async () => {
    const pair = { topUpId: "student-topup", reference: "unify-wlt-ffffffffffffffffffff" };
    await expect(getFunderTopup(pair)).rejects.toMatchObject({ code: "TOPUP_NOT_FOUND" });
    await expect(reconcileFunderTopup(pair)).rejects.toMatchObject({ code: "TOPUP_NOT_FOUND" });
    expect(paystack.verifyTransaction).not.toHaveBeenCalled();
  });
});

describe("reconcile and student notification", () => {
  const pair = { topUpId: "topup-1", reference: "unify-wlt-0123456789abcdef0123" };

  beforeEach(() => {
    store.attempts.push(makeAttempt());
  });

  it("emails the student exactly once across concurrent reconciles", async () => {
    const results = await Promise.all([reconcileFunderTopup(pair), reconcileFunderTopup(pair)]);

    expect(results.map((result) => result.status)).toEqual(["SUCCEEDED", "SUCCEEDED"]);
    expect(completePendingTopup).toHaveBeenCalledTimes(2);
    expect(sendFunderTopupReceivedEmail).toHaveBeenCalledTimes(1);
    expect(sendFunderTopupReceivedEmail).toHaveBeenCalledWith({
      to: "student@example.test",
      studentName: "Alex Example",
      funderName: "Jane Doe",
      amount: expect.stringMatching(/^R\s?50,00$/),
    });
  });

  it("emails the student exactly once across sequential reconciles", async () => {
    await reconcileFunderTopup(pair);
    await reconcileFunderTopup(pair);
    expect(sendFunderTopupReceivedEmail).toHaveBeenCalledTimes(1);
  });

  it("keeps the credit and SUCCEEDED status when the email fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    sendFunderTopupReceivedEmail.mockRejectedValue(new Error("Resend is down for student@example.test"));

    await expect(reconcileFunderTopup(pair)).resolves.toMatchObject({ status: "SUCCEEDED" });
    expect(store.attempts[0].status).toBe("SUCCEEDED");
    expect(warn).toHaveBeenCalledWith("[funder-topup] student notification failed for attempt topup-1");
  });

  it("never emails for a student-initiated top-up", async () => {
    store.attempts[0] = makeAttempt({ funderName: null, funderEmail: null, funderIpHash: null, sessionId: "session-1" });
    const { reconcileWalletTopup } = await import("@/lib/payments/topups");
    await expect(reconcileWalletTopup({ studentId: "student-1", topUpId: "topup-1" })).resolves.toMatchObject({ status: "SUCCEEDED" });
    expect(sendFunderTopupReceivedEmail).not.toHaveBeenCalled();
  });
});

describe("student activity feed", () => {
  it("titles completed funder top-ups 'From <name>' and hides open funder attempts", async () => {
    database.walletAccount.findUnique.mockResolvedValue({ id: "wallet-1" });
    database.ledgerEntry.findMany.mockResolvedValue([
      {
        direction: "CREDIT", amountMinor: BigInt(5_000), currency: "ZAR", createdAt: new Date("2026-10-12T09:00:00Z"),
        walletTransaction: { id: "wt-funded", type: "TOPUP", status: "COMPLETED", reference: "unify-wlt-a", completedAt: new Date("2026-10-12T09:00:00Z"), vendorBranch: null, topupAttempt: { reference: "unify-wlt-a", funderName: "Jane Doe" } },
      },
      {
        direction: "CREDIT", amountMinor: BigInt(2_000), currency: "ZAR", createdAt: new Date("2026-10-12T08:00:00Z"),
        walletTransaction: { id: "wt-own", type: "TOPUP", status: "COMPLETED", reference: "unify-wlt-b", completedAt: new Date("2026-10-12T08:00:00Z"), vendorBranch: null, topupAttempt: { reference: "unify-wlt-b", funderName: null } },
      },
    ]);
    store.attempts.push(
      makeAttempt({ id: "funder-pending", walletTransactionId: "wt-funder-pending", reference: "unify-wlt-c" }),
      makeAttempt({ id: "funder-failed", walletTransactionId: "wt-funder-failed", reference: "unify-wlt-d", status: "FAILED", walletTransaction: { status: "FAILED", completedAt: null, initiatorAccountId: "wallet-1" } }),
      makeAttempt({ id: "student-pending", walletTransactionId: "wt-student-pending", reference: "unify-wlt-e", funderName: null, funderEmail: null, funderIpHash: null, sessionId: "session-1" }),
    );

    const activity = await listMobileWalletActivity("student-1");

    expect(database.walletTopupAttempt.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ funderEmail: null }) }));
    expect(activity.map((item) => [item.id, item.title, item.subtitle])).toEqual([
      ["wt-student-pending", "Wallet top-up", "unify-wlt-e"],
      ["wt-funded", "From Jane Doe", "unify-wlt-a"],
      ["wt-own", "Wallet top-up", "unify-wlt-b"],
    ]);
    expect(activity.map((item) => ("funderName" in item ? item.funderName : undefined))).toEqual([undefined, "Jane Doe", undefined]);
  });
});

describe("public funder routes", () => {
  function routeRequest(path: string, body: unknown, origin = "https://portal.example.test") {
    return new Request(`https://portal.example.test${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify(body),
    });
  }

  beforeEach(() => {
    store.attempts.push(makeAttempt({ id: `route-${Math.random()}`, reference: "unify-wlt-route0000000000000000" }));
  });

  it("returns the funder-safe status with no-store caching", async () => {
    const { id: topUpId, reference } = store.attempts[0];
    const response = await statusRoute(routeRequest("/api/fund/topups/status", { topUpId, reference }));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    const body = await response.json();
    expect(Object.keys(body).every((key) => FUNDER_RESULT_KEYS.includes(key))).toBe(true);
  });

  it("rejects cross-origin requests", async () => {
    const { id: topUpId, reference } = store.attempts[0];
    const response = await reconcileRoute(routeRequest("/api/fund/topups/reconcile", { topUpId, reference }, "https://evil.example"));
    expect(response.status).toBe(403);
    expect(paystack.verifyTransaction).not.toHaveBeenCalled();
  });

  it("answers a wrong pair with a generic not-found and invalid bodies with a generic 400", async () => {
    const { id: topUpId } = store.attempts[0];
    const missing = await statusRoute(routeRequest("/api/fund/topups/status", { topUpId, reference: "unify-wlt-nope" }));
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: { code: "TOPUP_NOT_FOUND", message: "Payment not found." } });

    const invalid = await statusRoute(routeRequest("/api/fund/topups/status", { topUpId }));
    expect(invalid.status).toBe(400);
  });

  it("never passes a domain error's own message through", async () => {
    const { id: topUpId, reference } = store.attempts[0];
    paystack.verifyTransaction.mockRejectedValue(new WalletDomainError("ACCOUNT_SUSPENDED", "Student wallet account cannot start a top-up."));
    const response = await reconcileRoute(routeRequest("/api/fund/topups/reconcile", { topUpId, reference }));
    const body = await response.json();
    expect(response.status).toBe(503);
    expect(JSON.stringify(body)).not.toMatch(/student/i);
  });

  it("rate limits each route per top-up", async () => {
    const { id: topUpId, reference } = store.attempts[0];
    const statuses = [];
    for (let index = 0; index < 6; index += 1) {
      statuses.push((await statusRoute(routeRequest("/api/fund/topups/status", { topUpId, reference }))).status);
    }
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
    // The reconcile route has its own budget for the same top-up.
    expect((await reconcileRoute(routeRequest("/api/fund/topups/reconcile", { topUpId, reference }))).status).toBe(200);
  });
});

describe("funding form errors", () => {
  it("maps domain errors to fixed keys and messages", () => {
    expect(fundErrorMessage(fundErrorKeyFor(new WalletDomainError("FUNDING_RECIPIENT_NOT_ELIGIBLE", "x")))).toBe(NOT_ELIGIBLE_MESSAGE);
    expect(fundErrorMessage(fundErrorKeyFor(new WalletDomainError("RATE_LIMITED", "x")))).toBe("Too many attempts. Please wait a few minutes and try again.");
    expect(fundErrorMessage(fundErrorKeyFor(new WalletDomainError("PAYMENT_WALLET_DISABLED", "x")))).toBe("Funding is currently unavailable.");
    expect(fundErrorMessage(fundErrorKeyFor(new WalletDomainError("TOPUP_AMOUNT_OUT_OF_RANGE", "x")))).toMatch(/^Enter an amount between R\s?10,00 and R\s?5[\s ]000,00\.$/);
    expect(fundErrorMessage(fundErrorKeyFor(new WalletDomainError("ACCOUNT_SUSPENDED", "Student wallet is suspended")))).toBe("We couldn't start the payment. Please try again.");
    expect(fundErrorMessage(fundErrorKeyFor(new Error("database said something about student 2026001")))).toBe("We couldn't start the payment. Please try again.");
  });

  it("never echoes arbitrary text from the query string", () => {
    expect(fundErrorMessage(undefined)).toBeNull();
    expect(fundErrorMessage("Call 0800 000 000 to finish your payment")).toBe("We couldn't start the payment. Please try again.");
  });
});
