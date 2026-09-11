import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  encodeLivePaymentCursor,
  getLivePaymentEvents,
  listRecentVendorPayments,
} from "@/lib/vendors/livePayments";

const database = vi.hoisted(() => ({ walletTransaction: { findMany: vi.fn() } }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: database }));

const context = {
  userId: "staff-1",
  vendorProfileId: "vendor-1",
  companyName: "Cafe",
  role: "STAFF" as const,
  branchIds: ["branch-1"],
};

const payment = {
  id: "txn-1",
  amountMinor: BigInt(1250),
  currency: "ZAR",
  completedAt: new Date("2026-09-11T08:10:00.000Z"),
  createdAt: new Date("2026-09-11T08:09:58.000Z"),
  reference: "spend-1",
  vendorBranchId: "branch-1",
  refundableUntil: new Date("2026-09-11T08:20:00.000Z"),
  vendorBranch: { name: "Main Branch" },
  initiatorAccount: {
    student: {
      studentNumber: "VOSCAL099",
      firstName: "Caleb",
      lastName: "Voskuil",
    },
  },
};

describe("live vendor payment feed", () => {
  beforeEach(() => vi.clearAllMocks());

  it("initializes a cursor without replaying old payments", async () => {
    const result = await getLivePaymentEvents(context);
    expect(result.events).toEqual([]);
    expect(result.nextCursor).toBeTruthy();
    expect(database.walletTransaction.findMany).not.toHaveBeenCalled();
  });

  it("lists recent completed spends for the scoped branches", async () => {
    database.walletTransaction.findMany.mockResolvedValue([payment]);

    const result = await listRecentVendorPayments(context);

    expect(result[0]).toMatchObject({
      transactionId: "txn-1",
      branchName: "Main Branch",
      studentName: "Caleb Voskuil",
      studentNumber: "VOSCAL099",
      amountMinor: 1250,
      reference: "spend-1",
    });
    expect(database.walletTransaction.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        type: "SPEND",
        status: "COMPLETED",
        vendorBranchId: { in: ["branch-1"] },
      }),
    }));
  });

  it("can narrow the live feed to an allowed branch subset", async () => {
    database.walletTransaction.findMany.mockResolvedValue([]);
    const cursor = encodeLivePaymentCursor({ completedAt: "2026-09-11T08:00:00.000Z", id: "_" });

    await getLivePaymentEvents(
      { ...context, branchIds: ["branch-1", "branch-2"] },
      cursor,
      { branchIds: ["branch-2"] },
    );

    expect(database.walletTransaction.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ vendorBranchId: { in: ["branch-2"] } }),
    }));
  });

  it("uses a completedAt and id cursor for live polling", async () => {
    database.walletTransaction.findMany.mockResolvedValue([payment]);
    const cursor = encodeLivePaymentCursor({ completedAt: "2026-09-11T08:00:00.000Z", id: "_" });

    const result = await getLivePaymentEvents(context, cursor);

    expect(result.events).toHaveLength(1);
    expect(result.nextCursor).not.toBe(cursor);
    expect(database.walletTransaction.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        OR: [
          { completedAt: { gt: new Date("2026-09-11T08:00:00.000Z") } },
          { completedAt: new Date("2026-09-11T08:00:00.000Z"), id: { gt: "_" } },
        ],
      }),
    }));
  });
});
