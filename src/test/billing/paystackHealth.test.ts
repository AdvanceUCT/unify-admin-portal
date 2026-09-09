import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/paymentProviders/paystack/client", () => ({ fetchSubaccount: vi.fn() }));
vi.mock("@/lib/paymentProviders/paystack/config", () => ({ resolvePaystackProviderConfig: vi.fn() }));

import { fetchSubaccount } from "@/lib/paymentProviders/paystack/client";
import { resolvePaystackProviderConfig } from "@/lib/paymentProviders/paystack/config";
import { checkPaystackConfiguration } from "@/lib/billing/paystackHealth";

const CONFIG = {
  secretKey: "sk_test_fixture",
  mode: "test",
  accountRef: "university-demo",
  subaccountCode: "ACCT_PLATFORM_TEST_CODE",
  expectedIntegrationId: "2001638",
  baseUrl: "https://api.paystack.example",
};

describe("checkPaystackConfiguration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolvePaystackProviderConfig).mockReturnValue(CONFIG);
  });

  it("reports healthy when every check passes", async () => {
    vi.mocked(fetchSubaccount).mockResolvedValue({
      subaccountCode: "ACCT_PLATFORM_TEST_CODE",
      active: true,
      currency: "ZAR",
      domain: "test",
      integrationId: "2001638",
    });

    const report = await checkPaystackConfiguration();

    expect(report).toEqual({
      accountRef: "university-demo",
      mode: "test",
      subaccountCode: "ACCT_PLATFORM_TEST_CODE",
      subaccountActive: true,
      subaccountCurrencyOk: true,
      subaccountDomainOk: true,
      integrationIdMatches: true,
      healthy: true,
    });
  });

  it("flags an inactive subaccount as unhealthy without throwing", async () => {
    vi.mocked(fetchSubaccount).mockResolvedValue({
      subaccountCode: "ACCT_PLATFORM_TEST_CODE",
      active: false,
      currency: "ZAR",
      domain: "test",
      integrationId: "2001638",
    });

    const report = await checkPaystackConfiguration();
    expect(report.healthy).toBe(false);
    expect(report.subaccountActive).toBe(false);
  });

  it("flags a currency/domain/integration mismatch individually", async () => {
    vi.mocked(fetchSubaccount).mockResolvedValue({
      subaccountCode: "ACCT_PLATFORM_TEST_CODE",
      active: true,
      currency: "NGN",
      domain: "live",
      integrationId: "9999999",
    });

    const report = await checkPaystackConfiguration();
    expect(report).toMatchObject({
      subaccountCurrencyOk: false,
      subaccountDomainOk: false,
      integrationIdMatches: false,
      healthy: false,
    });
  });
});
