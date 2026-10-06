import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/audit/audit", () => ({ writeAuditLog: vi.fn() }));
vi.mock("@/lib/db/prisma", () => {
  const tx = { universityProfile: { findMany: vi.fn(), update: vi.fn() } };
  return { prisma: { $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)), tx } };
});

import { writeAuditLog } from "@/lib/audit/audit";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { updatePaymentWalletSettingsAction } from "@/app/(admin)/settings/payment-wallet/actions";

const tx = (prisma as unknown as { tx: { universityProfile: { findMany: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> } } }).tx;
const superAdmin = { user: { id: "admin-1", role: "SUPER_ADMIN" } } as Awaited<ReturnType<typeof requireRole>>;

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

describe("updatePaymentWalletSettingsAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tx.universityProfile.findMany.mockResolvedValue([
      { id: "uni-1", paymentWalletPayoutThresholdMinor: BigInt(50_000), paymentWalletOverdraftSuspensionDays: 14 },
    ]);
  });

  it("is SUPER_ADMIN only", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("Forbidden"));

    await expect(
      updatePaymentWalletSettingsAction(form({ payoutThreshold: "50", overdraftSuspensionDays: "7" })),
    ).rejects.toThrow("Forbidden");
    expect(requireRole).toHaveBeenCalledWith(["SUPER_ADMIN"]);
    expect(tx.universityProfile.update).not.toHaveBeenCalled();
  });

  it.each([
    [{ payoutThreshold: "0", overdraftSuspensionDays: "14" }, /threshold/i],
    [{ payoutThreshold: "12.345", overdraftSuspensionDays: "14" }, /threshold/i],
    [{ payoutThreshold: "500", overdraftSuspensionDays: "0" }, /between 1 and 365/],
    [{ payoutThreshold: "500", overdraftSuspensionDays: "366" }, /between 1 and 365/],
    [{ payoutThreshold: "500", overdraftSuspensionDays: "1.5" }, /between 1 and 365/],
  ])("rejects invalid input %o without saving", async (values, message) => {
    vi.mocked(requireRole).mockResolvedValue(superAdmin);

    const result = await updatePaymentWalletSettingsAction(form(values));

    expect(result).toEqual({ status: "error", message: expect.stringMatching(message) });
    expect(tx.universityProfile.update).not.toHaveBeenCalled();
    expect(writeAuditLog).not.toHaveBeenCalled();
  });

  it("saves the settings and audits old and new values in the same transaction", async () => {
    vi.mocked(requireRole).mockResolvedValue(superAdmin);

    const result = await updatePaymentWalletSettingsAction(form({ payoutThreshold: "50.00", overdraftSuspensionDays: "7" }));

    expect(result).toEqual({ status: "saved" });
    expect(tx.universityProfile.update).toHaveBeenCalledWith({
      where: { id: "uni-1" },
      data: { paymentWalletPayoutThresholdMinor: BigInt(5_000), paymentWalletOverdraftSuspensionDays: 7 },
    });
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "PAYMENT_WALLET_SETTINGS_UPDATED",
        actorId: "admin-1",
        meta: {
          oldPayoutThresholdMinor: 50_000,
          newPayoutThresholdMinor: 5_000,
          oldOverdraftSuspensionDays: 14,
          newOverdraftSuspensionDays: 7,
        },
      }),
      tx,
    );
  });
});
