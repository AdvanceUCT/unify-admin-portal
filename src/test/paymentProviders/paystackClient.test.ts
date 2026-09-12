import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createTransferRecipient,
  fetchSubaccount,
  initializeTransaction,
  initiateTransfer,
  verifyTransaction,
  verifyTransfer,
} from "@/lib/paymentProviders/paystack/client";
import { PaystackProviderError } from "@/lib/paymentProviders/paystack/errors";

const BASE_URL = "https://api.paystack.example";
const SECRET_KEY = "sk_test_fixture";

function responseJson(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

function stubFetchOnce(response: Response | (() => Promise<Response>)) {
  const fetchMock = vi.fn((_url: string, _init?: RequestInit) =>
    typeof response === "function" ? response() : Promise.resolve(response),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("initializeTransaction", () => {
  it("sends the exact documented split payload and returns the parsed access code", async () => {
    const fetchMock = stubFetchOnce(
      responseJson({
        status: true,
        message: "Authorization URL created",
        data: { authorization_url: "https://checkout.paystack.com/xyz", access_code: "xyz", reference: "unify-inv-abc" },
      }),
    );

    const result = await initializeTransaction(SECRET_KEY, BASE_URL, {
      email: "vendor-owner@example.test",
      amountMinor: BigInt(100_000),
      currency: "ZAR",
      reference: "unify-inv-abc",
      subaccountCode: "ACCT_PLATFORM_TEST_CODE",
      transactionChargeMinor: BigInt(90_000),
      callbackUrl: "https://demo-host/vendor/invoices/inv-1/payment-return",
      metadata: { invoiceId: "inv-1", attemptId: "att-1", purpose: "vendor_invoice_payment" },
    });

    expect(result).toEqual({ authorizationUrl: "https://checkout.paystack.com/xyz", accessCode: "xyz", reference: "unify-inv-abc" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE_URL}/transaction/initialize`);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${SECRET_KEY}`);
    expect(JSON.parse(init.body as string)).toEqual({
      email: "vendor-owner@example.test",
      amount: "100000",
      currency: "ZAR",
      reference: "unify-inv-abc",
      subaccount: "ACCT_PLATFORM_TEST_CODE",
      transaction_charge: 90000,
      bearer: "account",
      channels: ["card"],
      callback_url: "https://demo-host/vendor/invoices/inv-1/payment-return",
      metadata: { invoiceId: "inv-1", attemptId: "att-1", purpose: "vendor_invoice_payment" },
    });
  });

  it("rejects an amount above the safe integer boundary before calling Paystack", async () => {
    const fetchMock = stubFetchOnce(responseJson({ status: true, data: {} }));

    await expect(
      initializeTransaction(SECRET_KEY, BASE_URL, {
        email: "a@example.test",
        amountMinor: BigInt(Number.MAX_SAFE_INTEGER) + BigInt(1),
        currency: "ZAR",
        reference: "unify-inv-abc",
        subaccountCode: "ACCT_X",
        transactionChargeMinor: BigInt(1),
        callbackUrl: "https://demo-host/return",
        metadata: {},
      }),
    ).rejects.toMatchObject({ code: "AMOUNT_UNSAFE" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps a minimum-amount 4xx rejection to AMOUNT_TOO_SMALL", async () => {
    stubFetchOnce(responseJson({ status: false, message: "Amount must be at least 100" }, { status: 400 }));

    await expect(
      initializeTransaction(SECRET_KEY, BASE_URL, {
        email: "a@example.test",
        amountMinor: BigInt(1),
        currency: "ZAR",
        reference: "unify-inv-abc",
        subaccountCode: "ACCT_X",
        transactionChargeMinor: BigInt(1),
        callbackUrl: "https://demo-host/return",
        metadata: {},
      }),
    ).rejects.toMatchObject({ code: "AMOUNT_TOO_SMALL" });
  });

  it("maps a bad-subaccount 4xx rejection to HTTP_ERROR", async () => {
    stubFetchOnce(responseJson({ status: false, message: "Subaccount not found" }, { status: 400 }));

    await expect(
      initializeTransaction(SECRET_KEY, BASE_URL, {
        email: "a@example.test",
        amountMinor: BigInt(100),
        currency: "ZAR",
        reference: "unify-inv-abc",
        subaccountCode: "ACCT_MISSING",
        transactionChargeMinor: BigInt(90),
        callbackUrl: "https://demo-host/return",
        metadata: {},
      }),
    ).rejects.toMatchObject({ code: "HTTP_ERROR" });
  });

  it("maps a 5xx response to HTTP_ERROR", async () => {
    stubFetchOnce(responseJson({ status: false, message: "Internal error" }, { status: 502 }));

    await expect(
      initializeTransaction(SECRET_KEY, BASE_URL, {
        email: "a@example.test",
        amountMinor: BigInt(100),
        currency: "ZAR",
        reference: "unify-inv-abc",
        subaccountCode: "ACCT_X",
        transactionChargeMinor: BigInt(90),
        callbackUrl: "https://demo-host/return",
        metadata: {},
      }),
    ).rejects.toMatchObject({ code: "HTTP_ERROR" });
  });

  it("maps a malformed (non-JSON) response to MALFORMED_RESPONSE", async () => {
    stubFetchOnce(new Response("not json", { status: 200 }));

    await expect(
      initializeTransaction(SECRET_KEY, BASE_URL, {
        email: "a@example.test",
        amountMinor: BigInt(100),
        currency: "ZAR",
        reference: "unify-inv-abc",
        subaccountCode: "ACCT_X",
        transactionChargeMinor: BigInt(90),
        callbackUrl: "https://demo-host/return",
        metadata: {},
      }),
    ).rejects.toMatchObject({ code: "MALFORMED_RESPONSE" });
  });

  it("maps a status:true response missing the data envelope to MALFORMED_RESPONSE", async () => {
    stubFetchOnce(responseJson({ status: true, message: "ok" }));

    await expect(
      initializeTransaction(SECRET_KEY, BASE_URL, {
        email: "a@example.test",
        amountMinor: BigInt(100),
        currency: "ZAR",
        reference: "unify-inv-abc",
        subaccountCode: "ACCT_X",
        transactionChargeMinor: BigInt(90),
        callbackUrl: "https://demo-host/return",
        metadata: {},
      }),
    ).rejects.toMatchObject({ code: "MALFORMED_RESPONSE" });
  });

  it("surfaces a network failure before any response as UNKNOWN_OUTCOME", async () => {
    stubFetchOnce(() => Promise.reject(new TypeError("network down")));

    const error = await initializeTransaction(SECRET_KEY, BASE_URL, {
      email: "a@example.test",
      amountMinor: BigInt(100),
      currency: "ZAR",
      reference: "unify-inv-abc",
      subaccountCode: "ACCT_X",
      transactionChargeMinor: BigInt(90),
      callbackUrl: "https://demo-host/return",
      metadata: {},
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(PaystackProviderError);
    expect((error as PaystackProviderError).code).toBe("UNKNOWN_OUTCOME");
  });

  it("surfaces an aborted/timed-out request as TIMEOUT, distinct from a definite failure", async () => {
    stubFetchOnce(() => Promise.reject(new DOMException("The operation was aborted", "TimeoutError")));

    const error = await initializeTransaction(SECRET_KEY, BASE_URL, {
      email: "a@example.test",
      amountMinor: BigInt(100),
      currency: "ZAR",
      reference: "unify-inv-abc",
      subaccountCode: "ACCT_X",
      transactionChargeMinor: BigInt(90),
      callbackUrl: "https://demo-host/return",
      metadata: {},
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(PaystackProviderError);
    expect((error as PaystackProviderError).code).toBe("TIMEOUT");
  });
});

describe("verifyTransaction", () => {
  it("parses a successful verification into the normalized shape, excluding sensitive sub-objects", async () => {
    stubFetchOnce(
      responseJson({
        status: true,
        message: "Verification successful",
        data: {
          id: 4099,
          reference: "unify-inv-abc",
          status: "success",
          amount: 100_000,
          currency: "ZAR",
          domain: "test",
          paid_at: "2026-09-11T10:00:00.000Z",
          gateway_response: "Successful",
          fees: 1_500,
          subaccount: { subaccount_code: "ACCT_PLATFORM_TEST_CODE" },
          split: { type: "flat", subaccounts: [{ subaccount: "ACCT_PLATFORM_TEST_CODE", share: 90000 }] },
          authorization: { authorization_code: "AUTH_should_never_be_read", card_type: "visa" },
          customer: { email: "vendor-owner@example.test" },
        },
      }),
    );

    const result = await verifyTransaction(SECRET_KEY, BASE_URL, "unify-inv-abc");

    expect(result).toEqual({
      providerTransactionId: "4099",
      reference: "unify-inv-abc",
      status: "success",
      amountMinor: BigInt(100_000),
      currency: "ZAR",
      domain: "test",
      paidAtIso: "2026-09-11T10:00:00.000Z",
      gatewayResponse: "Successful",
      subaccountCode: "ACCT_PLATFORM_TEST_CODE",
      feesMinor: BigInt(1_500),
      splitEvidence: { type: "flat", subaccounts: [{ subaccount: "ACCT_PLATFORM_TEST_CODE", share: 90000 }] },
    });
  });

  it("still parses a failed/abandoned transaction rather than throwing", async () => {
    stubFetchOnce(
      responseJson({
        status: true,
        message: "Verification successful",
        data: { id: 4100, reference: "unify-inv-def", status: "abandoned", amount: 100_000, currency: "ZAR", domain: "test" },
      }),
    );

    const result = await verifyTransaction(SECRET_KEY, BASE_URL, "unify-inv-def");
    expect(result.status).toBe("abandoned");
  });
});

describe("fetchSubaccount", () => {
  it("parses the safe subaccount health fields", async () => {
    stubFetchOnce(
      responseJson({
        status: true,
        message: "Subaccount retrieved",
        data: { subaccount_code: "ACCT_PLATFORM_TEST_CODE", active: true, currency: "ZAR", domain: "test", integration: { id: 2001638 } },
      }),
    );

    const result = await fetchSubaccount(SECRET_KEY, BASE_URL, "ACCT_PLATFORM_TEST_CODE");
    expect(result).toEqual({ subaccountCode: "ACCT_PLATFORM_TEST_CODE", active: true, currency: "ZAR", domain: "test", integrationId: "2001638" });
  });

  it("reports an inactive/wrong-currency subaccount rather than throwing, so the health checker can flag it", async () => {
    stubFetchOnce(
      responseJson({
        status: true,
        message: "Subaccount retrieved",
        data: { subaccount_code: "ACCT_X", active: false, currency: "NGN", domain: "live", integration: 999 },
      }),
    );

    const result = await fetchSubaccount(SECRET_KEY, BASE_URL, "ACCT_X");
    expect(result.active).toBe(false);
    expect(result.currency).toBe("NGN");
    expect(result.integrationId).toBe("999");
  });
});

describe("transfer recipients and transfers", () => {
  it("creates a ZAR basa recipient without returning the raw account number", async () => {
    const fetchMock = stubFetchOnce(
      responseJson({
        status: true,
        message: "Transfer recipient created",
        data: {
          recipient_code: "RCP_test_recipient",
          active: true,
          currency: "ZAR",
          type: "basa",
          details: {
            account_name: "Campus Coffee",
            account_number: "1234567890",
            bank_code: "250655",
            bank_name: "Test Bank",
          },
        },
      }),
    );

    const result = await createTransferRecipient(SECRET_KEY, BASE_URL, {
      type: "basa",
      name: "Campus Coffee",
      accountNumber: "1234567890",
      bankCode: "250655",
      currency: "ZAR",
      metadata: { vendorProfileId: "vendor-1" },
    });

    expect(result).toEqual({
      recipientCode: "RCP_test_recipient",
      active: true,
      currency: "ZAR",
      type: "basa",
      details: {
        accountName: "Campus Coffee",
        accountNumberLast4: "7890",
        bankCode: "250655",
        bankName: "Test Bank",
      },
    });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      type: "basa",
      name: "Campus Coffee",
      account_number: "1234567890",
      bank_code: "250655",
      currency: "ZAR",
      metadata: { vendorProfileId: "vendor-1" },
    });
  });

  it("initiates a single transfer using the payout reference", async () => {
    const fetchMock = stubFetchOnce(
      responseJson({
        status: true,
        message: "Transfer queued",
        data: {
          id: 123,
          transfer_code: "TRF_test_transfer",
          reference: "unify-payout-abc",
          status: "success",
          amount: 1500,
          currency: "ZAR",
        },
      }),
    );

    const result = await initiateTransfer(SECRET_KEY, BASE_URL, {
      amountMinor: BigInt(1_500),
      recipientCode: "RCP_test_recipient",
      reference: "unify-payout-abc",
      reason: "UNIFY vendor wallet payout",
    });

    expect(result).toEqual({
      providerTransferId: "123",
      transferCode: "TRF_test_transfer",
      reference: "unify-payout-abc",
      status: "success",
      amountMinor: BigInt(1_500),
      currency: "ZAR",
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE_URL}/transfer`);
    expect(JSON.parse(init.body as string)).toEqual({
      source: "balance",
      amount: 1500,
      recipient: "RCP_test_recipient",
      reference: "unify-payout-abc",
      reason: "UNIFY vendor wallet payout",
    });
  });

  it("verifies transfers by reference for reconciliation", async () => {
    stubFetchOnce(
      responseJson({
        status: true,
        message: "Transfer retrieved",
        data: {
          id: "123",
          transfer_code: "TRF_test_transfer",
          reference: "unify-payout-abc",
          status: "pending",
          amount: 1500,
          currency: "ZAR",
        },
      }),
    );

    await expect(verifyTransfer(SECRET_KEY, BASE_URL, "unify-payout-abc")).resolves.toMatchObject({
      transferCode: "TRF_test_transfer",
      status: "pending",
    });
  });
});
