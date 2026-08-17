/**
 * @fileoverview Server-only wrappers around the StudentRegistry and WalletBalance contracts.
 * @module lib/ethereum/ethereumService
 */

import "server-only";

import { formatEther, isAddress, keccak256, toUtf8Bytes } from "ethers";

import { getProvider, getStudentRegistryContract, getWalletBalanceContract } from "@/lib/ethereum/provider";

/**
 * Thrown when an Ethereum service call fails, carrying an HTTP status the
 * caller (typically an API route) can return directly.
 */
export class EthereumServiceError extends Error {
  constructor(
    message: string,
    public statusCode: number,
  ) {
    super(message);
    this.name = "EthereumServiceError";
  }
}

function assertValidAddress(address: string): void {
  if (!isAddress(address)) {
    throw new EthereumServiceError(`Invalid Ethereum address: ${address}`, 400);
  }
}

export async function registerStudentOnChain(
  studentEthAddress: string,
  studentNumber: string,
): Promise<{ txHash: string; registeredAt: string }> {
  assertValidAddress(studentEthAddress);

  const studentNumberHash = keccak256(toUtf8Bytes(studentNumber));
  const registry = getStudentRegistryContract();
  const tx = await registry.registerStudent(studentEthAddress, studentNumberHash);
  await tx.wait();

  return { txHash: tx.hash, registeredAt: new Date().toISOString() };
}

export async function removeStudentFromChain(
  studentEthAddress: string,
): Promise<{ txHash: string; removedAt: string }> {
  assertValidAddress(studentEthAddress);

  const registry = getStudentRegistryContract();
  const tx = await registry.removeStudent(studentEthAddress);
  await tx.wait();

  return { txHash: tx.hash, removedAt: new Date().toISOString() };
}

export async function getOnChainBalance(
  studentEthAddress: string,
): Promise<{ balanceWei: string; balanceEth: string }> {
  assertValidAddress(studentEthAddress);

  const walletBalance = getWalletBalanceContract();
  const result = await walletBalance.getBalance(studentEthAddress);

  return { balanceWei: result.toString(), balanceEth: formatEther(result) };
}

export async function isStudentVerifiedOnChain(studentEthAddress: string): Promise<boolean> {
  assertValidAddress(studentEthAddress);

  const registry = getStudentRegistryContract();
  return registry.checkStudent(studentEthAddress);
}

export async function getNetworkStatus(): Promise<{
  connected: boolean;
  network?: { name: string; chainId: number };
  blockNumber?: number;
  error?: string;
}> {
  try {
    const provider = getProvider();
    const [network, blockNumber] = await Promise.all([provider.getNetwork(), provider.getBlockNumber()]);

    return {
      connected: true,
      network: { name: network.name, chainId: Number(network.chainId) },
      blockNumber,
    };
  } catch (error) {
    return {
      connected: false,
      error: error instanceof Error ? error.message : "Unknown Ethereum network error",
    };
  }
}
