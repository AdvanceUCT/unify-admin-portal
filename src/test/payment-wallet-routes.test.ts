import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/payments/walletSession", () => ({
  authenticateWalletBearer: vi.fn(),
  refreshStudentPaymentSession: vi.fn(),
  requestStudentPaymentActivation: vi.fn(),
  revokeStudentPaymentSession: vi.fn(),
  verifyStudentPaymentActivation: vi.fn(),
}));
vi.mock("@/lib/payments/topups", () => ({
  createWalletTopup: vi.fn(),
  getWalletTopup: vi.fn(),
  reconcileWalletTopup: vi.fn(),
}));

import { POST as requestActivation } from "@/app/api/wallet/v1/activations/request/route";
import { POST as verifyActivation } from "@/app/api/wallet/v1/activations/verify/route";
import { POST as refreshSession } from "@/app/api/wallet/v1/sessions/refresh/route";
import { POST as revokeSession } from "@/app/api/wallet/v1/sessions/revoke/route";
import { POST as createTopup } from "@/app/api/wallet/v1/topups/route";
import { GET as getTopup } from "@/app/api/wallet/v1/topups/[topUpId]/route";
import { POST as reconcileTopup } from "@/app/api/wallet/v1/topups/[topUpId]/reconcile/route";
import {
  authenticateWalletBearer,
  refreshStudentPaymentSession,
  requestStudentPaymentActivation,
  revokeStudentPaymentSession,
  verifyStudentPaymentActivation,
} from "@/lib/payments/walletSession";
import { createWalletTopup, getWalletTopup, reconcileWalletTopup } from "@/lib/payments/topups";

function jsonRequest(path: string, body: unknown, token = "access-token") {
  return new Request(`http://localhost:3000${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const tokenResponse = {
  accessToken: "access-token",
  accessExpiresAt: "2026-09-10T10:15:00.000Z",
  refreshToken: "refresh-token",
  refreshExpiresAt: "2026-10-10T10:00:00.000Z",
  sessionId: "session-1",
};

describe("payment wallet API route contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authenticateWalletBearer).mockResolvedValue({
      sessionId: "session-1",
      studentId: "student-1",
      student: { id: "student-1" },
    } as Awaited<ReturnType<typeof authenticateWalletBearer>>);
  });

  it("requests activation with generic challenge metadata", async () => {
    vi.mocked(requestStudentPaymentActivation).mockResolvedValue({
      challengeId: "challenge-1",
      expiresAt: "2026-09-10T10:10:00.000Z",
      resendAvailableAt: "2026-09-10T10:01:00.000Z",
      destinationHint: "university email on record",
    });

    const response = await requestActivation(jsonRequest("/api/wallet/v1/activations/request", {
      studentNumber: "STU001",
      deviceId: "device-1",
    }));

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      challengeId: "challenge-1",
      expiresAt: "2026-09-10T10:10:00.000Z",
      resendAvailableAt: "2026-09-10T10:01:00.000Z",
      destinationHint: "university email on record",
    });
  });

  it("returns the locked token shape from activation verify and session refresh", async () => {
    vi.mocked(verifyStudentPaymentActivation).mockResolvedValue(tokenResponse);
    vi.mocked(refreshStudentPaymentSession).mockResolvedValue(tokenResponse);

    const verifyResponse = await verifyActivation(jsonRequest("/api/wallet/v1/activations/verify", {
      challengeId: "challenge-1",
      otp: "123456",
      deviceId: "device-1",
    }));
    const refreshResponse = await refreshSession(jsonRequest("/api/wallet/v1/sessions/refresh", {
      refreshToken: "refresh-token",
      sessionId: "session-1",
      deviceId: "device-1",
    }));

    await expect(verifyResponse.json()).resolves.toEqual(tokenResponse);
    await expect(refreshResponse.json()).resolves.toEqual(tokenResponse);
  });

  it("revokes via /sessions/revoke and not an activation route", async () => {
    const response = await revokeSession(jsonRequest("/api/wallet/v1/sessions/revoke", {}));

    expect(response.status).toBe(200);
    expect(revokeStudentPaymentSession).toHaveBeenCalledWith({ sessionId: "session-1" });
    await expect(response.json()).resolves.toEqual({ revoked: true });
  });

  it("creates, reads, and reconciles top-ups for the authenticated student", async () => {
    const topup = {
      topUpId: "topup-1",
      reference: "unify-wlt-abc",
      status: "PENDING" as const,
      authorizationUrl: "https://checkout.paystack.com/abc",
      amountMinor: 1000,
      currency: "ZAR" as const,
    };
    vi.mocked(createWalletTopup).mockResolvedValue(topup);
    vi.mocked(getWalletTopup).mockResolvedValue(topup);
    vi.mocked(reconcileWalletTopup).mockResolvedValue({ ...topup, status: "UNKNOWN", authorizationUrl: undefined });

    const createResponse = await createTopup(jsonRequest("/api/wallet/v1/topups", {
      amountMinor: 1000,
      currency: "ZAR",
      idempotencyKey: "key-1",
    }));
    const getResponse = await getTopup(new Request("http://localhost:3000/api/wallet/v1/topups/topup-1", {
      headers: { authorization: "Bearer access-token" },
    }), { params: Promise.resolve({ topUpId: "topup-1" }) });
    const reconcileResponse = await reconcileTopup(jsonRequest("/api/wallet/v1/topups/topup-1/reconcile", {}), {
      params: Promise.resolve({ topUpId: "topup-1" }),
    });

    expect(createResponse.status).toBe(201);
    expect(createWalletTopup).toHaveBeenCalledWith({
      studentId: "student-1",
      sessionId: "session-1",
      amountMinor: 1000,
      currency: "ZAR",
      idempotencyKey: "key-1",
    });
    await expect(getResponse.json()).resolves.toEqual(topup);
    await expect(reconcileResponse.json()).resolves.toEqual({ ...topup, status: "UNKNOWN", authorizationUrl: undefined });
  });
});
