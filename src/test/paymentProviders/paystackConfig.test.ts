import { beforeEach, describe, expect, it, vi } from "vitest";

const envMock = vi.hoisted(() => ({
  PAYSTACK_MODE: "test",
  PAYSTACK_SECRET_KEY: undefined as string | undefined,
  PAYSTACK_ACCOUNT_REF: "university-demo",
  PAYSTACK_PLATFORM_SUBACCOUNT_CODE: undefined as string | undefined,
  PAYSTACK_EXPECTED_INTEGRATION_ID: undefined as string | undefined,
}));

vi.mock("@/lib/config/env", () => ({ env: envMock }));

import { resolvePaystackProviderConfig, PAYSTACK_API_BASE_URL } from "@/lib/paymentProviders/paystack/config";
import { PaystackProviderError } from "@/lib/paymentProviders/paystack/errors";

describe("resolvePaystackProviderConfig", () => {
  beforeEach(() => {
    envMock.PAYSTACK_SECRET_KEY = undefined;
    envMock.PAYSTACK_PLATFORM_SUBACCOUNT_CODE = undefined;
    envMock.PAYSTACK_EXPECTED_INTEGRATION_ID = undefined;
  });

  it("throws NOT_CONFIGURED when any required identity variable is missing", () => {
    expect(() => resolvePaystackProviderConfig()).toThrow(PaystackProviderError);
    try {
      resolvePaystackProviderConfig();
    } catch (error) {
      expect((error as PaystackProviderError).code).toBe("NOT_CONFIGURED");
    }
  });

  it("resolves the full config once every identity variable is present", () => {
    envMock.PAYSTACK_SECRET_KEY = "sk_test_fixture";
    envMock.PAYSTACK_PLATFORM_SUBACCOUNT_CODE = "ACCT_PLATFORM_TEST_CODE";
    envMock.PAYSTACK_EXPECTED_INTEGRATION_ID = "2001638";

    const config = resolvePaystackProviderConfig();

    expect(config).toEqual({
      secretKey: "sk_test_fixture",
      mode: "test",
      accountRef: "university-demo",
      subaccountCode: "ACCT_PLATFORM_TEST_CODE",
      expectedIntegrationId: "2001638",
      baseUrl: PAYSTACK_API_BASE_URL,
    });
  });
});
