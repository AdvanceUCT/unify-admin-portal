import { beforeEach, describe, expect, it, vi } from "vitest";
import { integrationOverview } from "@/lib/vendors/integrationOverview";
const mocks = vi.hoisted(() => ({ vendor: vi.fn(), keys: vi.fn(), verification: vi.fn(), payment: vi.fn(), university: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { vendorProfile: { findUniqueOrThrow: mocks.vendor }, vendorWebhookDelivery: { findFirst: mocks.verification }, paymentWebhookDelivery: { findFirst: mocks.payment }, universityProfile: { findFirst: mocks.university } } }));
vi.mock("@/lib/vendors/integrations", () => ({ listVendorApiCredentials: mocks.keys }));
const branch = { id: "branch", name: "Campus", active: true, status: "ACTIVE", agentServicePointId: "point", paymentAcceptance: { status: "ACTIVE" } };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.vendor.mockResolvedValue({ defaultBranchId: "branch", branches: [branch], paymentProfile: { status: "APPROVED" }, webhookConfig: { enabled: true }, paymentWebhookConfigs: [{ branchIds: ["branch"] }] });
  mocks.keys.mockResolvedValue([{ scopes: ["verification:create", "verification:read", "payments:create", "payments:read", "payments:cancel"], branchIds: ["branch"], revokedAt: null }]);
  mocks.verification.mockResolvedValue(null); mocks.payment.mockResolvedValue(null); mocks.university.mockResolvedValue({ paymentWalletEnabled: true });
});
describe("integration readiness", () => {
  it("separates configured status from delivery evidence", async () => {
    const state = await integrationOverview("vendor");
    expect(state.verification).toMatchObject({ ready: true, key: true, callback: true, lastSuccess: null });
    expect(state.payments).toMatchObject({ ready: true, key: true, callback: true, lastSuccess: null });
    expect(state.branches[0].isDefault).toBe(true);
  });
  it("does not count revoked or incompatible branch keys as configured", async () => {
    mocks.keys.mockResolvedValue([{ scopes: ["verification:create", "verification:read"], branchIds: ["other"], revokedAt: null }, { scopes: ["payments:create", "payments:read", "payments:cancel"], branchIds: ["branch"], revokedAt: new Date() }]);
    const state = await integrationOverview("vendor");
    expect(state.verification.key).toBe(false); expect(state.payments.key).toBe(false);
  });
  it("keeps recovery configuration visible when the payment profile is suspended", async () => {
    mocks.vendor.mockResolvedValue({ defaultBranchId: "branch", branches: [branch], paymentProfile: { status: "SUSPENDED" }, webhookConfig: { enabled: true }, paymentWebhookConfigs: [{ branchIds: ["branch"] }] });
    const state = await integrationOverview("vendor");
    expect(state.payments.ready).toBe(false); expect(state.payments.callback).toBe(true);
    expect(state.payments.reason).toMatch(/recovery remains available/);
  });
  it("uses university wallet eligibility and excludes inactive branch acceptance", async () => {
    mocks.university.mockResolvedValue({ paymentWalletEnabled: false });
    expect((await integrationOverview("vendor")).payments.reason).toMatch(/disabled by the university/);
    mocks.university.mockResolvedValue({ paymentWalletEnabled: true });
    mocks.vendor.mockResolvedValue({ defaultBranchId: "branch", branches: [{ ...branch, paymentAcceptance: { status: "DISABLED" } }], paymentProfile: { status: "APPROVED" }, webhookConfig: null, paymentWebhookConfigs: [] });
    expect((await integrationOverview("vendor")).payments.reason).toMatch(/No active branch/);
  });
});
