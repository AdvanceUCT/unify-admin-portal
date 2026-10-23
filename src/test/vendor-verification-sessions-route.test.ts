import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/vendors/routeAuth", () => ({ vendorFromApiRequest: vi.fn() }));
vi.mock("@/lib/vendors/verifications", () => ({ createVendorCheckoutSession: vi.fn() }));

import { POST } from "@/app/api/vendor/v1/verification-sessions/route";
import { PosApiError } from "@/lib/payments/posErrors";
import { vendorFromApiRequest } from "@/lib/vendors/routeAuth";
import { createVendorCheckoutSession } from "@/lib/vendors/verifications";

function request(body: unknown = { checkoutId: "cart-001" }) {
  return new Request("http://localhost:3000/api/vendor/v1/verification-sessions", {
    method: "POST",
    headers: { authorization: "Bearer unify_vk_test" },
    body: JSON.stringify(body),
  });
}

const suspended = () =>
  new PosApiError("VENDOR_VERIFICATION_SUSPENDED", "This vendor's verifications are suspended until overdue invoices are paid.", 403);

describe("POST /api/vendor/v1/verification-sessions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the suspension code instead of masking it as a missing scope", async () => {
    vi.mocked(vendorFromApiRequest).mockRejectedValue(suspended());

    const response = await POST(request());

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: {
        code: "VENDOR_VERIFICATION_SUSPENDED",
        message: "This vendor's verifications are suspended until overdue invoices are paid.",
      },
    });
    expect(createVendorCheckoutSession).not.toHaveBeenCalled();
  });

  it("reports a suspension that starts between authentication and session creation", async () => {
    vi.mocked(vendorFromApiRequest).mockResolvedValue({ id: "vendor-001", branchIds: [] } as never);
    vi.mocked(createVendorCheckoutSession).mockRejectedValue(suspended());

    const response = await POST(request());

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: "VENDOR_VERIFICATION_SUSPENDED" } });
  });

  it("keeps the generic scope refusal for other authentication failures", async () => {
    vi.mocked(vendorFromApiRequest).mockRejectedValue(new Error("unexpected"));

    const response = await POST(request());

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: "MISSING_SCOPE" } });
  });
});
