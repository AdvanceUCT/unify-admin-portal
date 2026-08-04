import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  encodeLiveVerificationCursor,
  getLiveVerificationEvents,
} from "@/lib/vendors/liveVerifications";

const agent = vi.hoisted(() => ({ getVerificationResult: vi.fn() }));
const database = vi.hoisted(() => ({ vendorVerification: { findMany: vi.fn() } }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/agentClient", () => agent);
vi.mock("@/lib/db/prisma", () => ({ prisma: database }));

const context = {
  userId: "staff-1",
  vendorProfileId: "vendor-1",
  companyName: "Cafe",
  role: "STAFF" as const,
  branchIds: ["branch-1"],
};
const completedAt = new Date("2026-08-04T12:00:01.000Z");
const verification = {
  id: "verification-1",
  eventId: "event-1",
  verificationRequestId: "request-1",
  branchId: "branch-1",
  servicePointId: "service-point-1",
  servicePointName: "Main Branch",
  status: "APPROVED",
  failureCode: null,
  completedAt,
  branch: { id: "branch-1", name: "Main Branch" },
};

describe("live in-person verification feed", () => {
  beforeEach(() => vi.clearAllMocks());

  it("initializes a cursor without replaying old results", async () => {
    const result = await getLiveVerificationEvents(context);
    expect(result.events).toEqual([]);
    expect(result.nextCursor).toBeTruthy();
    expect(database.vendorVerification.findMany).not.toHaveBeenCalled();
  });

  it("returns verified identity without persisting it", async () => {
    database.vendorVerification.findMany.mockResolvedValue([verification]);
    agent.getVerificationResult.mockResolvedValue({
      verificationRequestId: "request-1",
      servicePointId: "service-point-1",
      status: "Approved",
      isVerified: true,
      attributes: { firstName: "Ada", lastName: "Lovelace", studentNumber: "STU001" },
    });
    const cursor = encodeLiveVerificationCursor({ completedAt: "2026-08-04T12:00:00.000Z", id: "_" });
    const result = await getLiveVerificationEvents(context, cursor);
    expect(result.events[0]).toMatchObject({ studentName: "Ada Lovelace", studentNumber: "STU001" });
    expect(database.vendorVerification.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ branchId: { in: ["branch-1"] }, checkoutId: null }),
    }));
  });

  it("never exposes attributes from an unverified proof", async () => {
    database.vendorVerification.findMany.mockResolvedValue([verification]);
    agent.getVerificationResult.mockResolvedValue({
      verificationRequestId: "request-1",
      status: "Declined",
      isVerified: false,
      attributes: { fullName: "Forged Name", studentNumber: "FORGED" },
    });
    const cursor = encodeLiveVerificationCursor({ completedAt: "2026-08-04T12:00:00.000Z", id: "_" });
    const result = await getLiveVerificationEvents(context, cursor);
    expect(result.events[0]).toMatchObject({ studentName: null, studentNumber: null });
  });
});
