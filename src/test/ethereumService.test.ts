import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkStudent: vi.fn(),
  getBalance: vi.fn(),
  getBlockNumber: vi.fn(),
  getNetwork: vi.fn(),
  registerStudent: vi.fn(),
  removeStudent: vi.fn(),
}));

vi.mock("@/lib/ethereum/provider", () => ({
  getProvider: () => ({
    getBlockNumber: mocks.getBlockNumber,
    getNetwork: mocks.getNetwork,
  }),
  getStudentRegistryContract: () => ({
    checkStudent: mocks.checkStudent,
    registerStudent: mocks.registerStudent,
    removeStudent: mocks.removeStudent,
  }),
  getWalletBalanceContract: () => ({
    getBalance: mocks.getBalance,
  }),
}));

import {
  EthereumServiceError,
  getNetworkStatus,
  getOnChainBalance,
  isStudentVerifiedOnChain,
  registerStudentOnChain,
  removeStudentFromChain,
} from "@/lib/ethereum/ethereumService";

const VALID_ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const INVALID_ADDRESS = "not-an-address";

describe("ethereumService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("registerStudentOnChain", () => {
    it("throws EthereumServiceError 400 for an invalid address", async () => {
      const error = await registerStudentOnChain(INVALID_ADDRESS, "STU001").catch((caught) => caught);

      expect(error).toBeInstanceOf(EthereumServiceError);
      expect((error as EthereumServiceError).statusCode).toBe(400);
      expect(mocks.registerStudent).not.toHaveBeenCalled();
    });

    it("hashes the student number rather than sending it in plain text", async () => {
      mocks.registerStudent.mockResolvedValue({ hash: "0xtxhash", wait: vi.fn().mockResolvedValue({}) });

      await registerStudentOnChain(VALID_ADDRESS, "STU001");

      const [, hashArg] = mocks.registerStudent.mock.calls[0];
      expect(hashArg).not.toBe("STU001");
      expect(hashArg).toMatch(/^0x[0-9a-f]{64}$/);
    });

    it("returns the transaction hash and an ISO registration timestamp on success", async () => {
      mocks.registerStudent.mockResolvedValue({ hash: "0xtxhash", wait: vi.fn().mockResolvedValue({}) });

      const result = await registerStudentOnChain(VALID_ADDRESS, "STU001");

      expect(result.txHash).toBe("0xtxhash");
      expect(new Date(result.registeredAt).toISOString()).toBe(result.registeredAt);
    });
  });

  describe("removeStudentFromChain", () => {
    it("throws EthereumServiceError 400 for an invalid address", async () => {
      const error = await removeStudentFromChain(INVALID_ADDRESS).catch((caught) => caught);

      expect(error).toBeInstanceOf(EthereumServiceError);
      expect((error as EthereumServiceError).statusCode).toBe(400);
      expect(mocks.removeStudent).not.toHaveBeenCalled();
    });

    it("returns the transaction hash and an ISO removal timestamp on success", async () => {
      mocks.removeStudent.mockResolvedValue({ hash: "0xremovetx", wait: vi.fn().mockResolvedValue({}) });

      const result = await removeStudentFromChain(VALID_ADDRESS);

      expect(result.txHash).toBe("0xremovetx");
      expect(new Date(result.removedAt).toISOString()).toBe(result.removedAt);
    });
  });

  describe("getOnChainBalance", () => {
    it("throws EthereumServiceError 400 for an invalid address", async () => {
      const error = await getOnChainBalance(INVALID_ADDRESS).catch((caught) => caught);

      expect(error).toBeInstanceOf(EthereumServiceError);
      expect((error as EthereumServiceError).statusCode).toBe(400);
    });

    it("returns the correct balanceEth string", async () => {
      mocks.getBalance.mockResolvedValue(BigInt("1500000000000000000"));

      const result = await getOnChainBalance(VALID_ADDRESS);

      expect(result.balanceWei).toBe("1500000000000000000");
      expect(result.balanceEth).toBe("1.5");
    });

    it("returns 0.0 for a zero balance", async () => {
      mocks.getBalance.mockResolvedValue(BigInt(0));

      const result = await getOnChainBalance(VALID_ADDRESS);

      expect(result.balanceEth).toBe("0.0");
    });
  });

  describe("isStudentVerifiedOnChain", () => {
    it("returns true when the contract returns true", async () => {
      mocks.checkStudent.mockResolvedValue(true);

      await expect(isStudentVerifiedOnChain(VALID_ADDRESS)).resolves.toBe(true);
    });

    it("returns false when the contract returns false", async () => {
      mocks.checkStudent.mockResolvedValue(false);

      await expect(isStudentVerifiedOnChain(VALID_ADDRESS)).resolves.toBe(false);
    });

    it("throws EthereumServiceError 400 for an invalid address", async () => {
      const error = await isStudentVerifiedOnChain(INVALID_ADDRESS).catch((caught) => caught);

      expect(error).toBeInstanceOf(EthereumServiceError);
      expect((error as EthereumServiceError).statusCode).toBe(400);
      expect(mocks.checkStudent).not.toHaveBeenCalled();
    });
  });

  describe("getNetworkStatus", () => {
    it("returns connected true on success", async () => {
      mocks.getNetwork.mockResolvedValue({ chainId: BigInt(11155111), name: "sepolia" });
      mocks.getBlockNumber.mockResolvedValue(123_456);

      const result = await getNetworkStatus();

      expect(result).toEqual({
        blockNumber: 123_456,
        connected: true,
        network: { chainId: 11155111, name: "sepolia" },
      });
    });

    it("returns connected false on a provider error", async () => {
      mocks.getNetwork.mockRejectedValue(new Error("network unreachable"));

      const result = await getNetworkStatus();

      expect(result.connected).toBe(false);
      expect(result.error).toBe("network unreachable");
    });
  });
});
