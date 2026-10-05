import { beforeEach, expect, it, vi } from "vitest";

const { completedRun } = vi.hoisted(() => ({ completedRun: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    credentialRenewalRecord: {
      findMany: vi.fn(async () => []),
      count: vi.fn(async () => 0),
      groupBy: vi.fn(async () => []),
    },
    credentialAutomationRun: {
      findMany: vi.fn(async () => []),
      findFirst: completedRun,
    },
    student: { findMany: vi.fn(async () => []) },
    credentialIssuance: { findMany: vi.fn(async () => []) },
    credentialOfferAttempt: { findMany: vi.fn(async () => []) },
  },
}));

import { renewalOverview } from "@/lib/credentials/renewalOverview";

const now = new Date("2026-10-03T10:00:00Z");
beforeEach(() => completedRun.mockReset());

it("does not flag the daily scheduler as stale between sweeps", async () => {
  completedRun.mockResolvedValue({ completedAt: new Date(now.getTime() - 24 * 3600000) });
  expect((await renewalOverview({}, now)).stale).toBe(false);
});

it("allows Hobby's timing grace before reporting two missed daily sweeps", async () => {
  completedRun.mockResolvedValue({ completedAt: new Date(now.getTime() - 49 * 3600000) });
  expect((await renewalOverview({}, now)).stale).toBe(false);
  completedRun.mockResolvedValue({ completedAt: new Date(now.getTime() - 49 * 3600000 - 1) });
  expect((await renewalOverview({}, now)).stale).toBe(true);
});

it("reports that the scheduler has never completed a run", async () => {
  completedRun.mockResolvedValue(null);
  expect((await renewalOverview({}, now)).stale).toBe(true);
});
