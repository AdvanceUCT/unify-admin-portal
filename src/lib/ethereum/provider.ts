/**
 * @fileoverview Server-only singletons for the Ethereum provider, admin wallet, and contract instances.
 * @module lib/ethereum/provider
 */

import "server-only";

import { Contract, JsonRpcProvider, Wallet } from "ethers";

import studentRegistryAbi from "@/lib/ethereum/abis/studentRegistry.abi.json";
import walletBalanceAbi from "@/lib/ethereum/abis/walletBalance.abi.json";

type RequiredEthereumEnvVar =
  | "ETHEREUM_RPC_URL"
  | "ADMIN_ETH_PRIVATE_KEY"
  | "STUDENT_REGISTRY_ADDRESS"
  | "WALLET_BALANCE_ADDRESS"
  | "STUDENT_PAYMENT_ADDRESS";

// Validated lazily, per variable, the first time each getter actually needs it —
// not eagerly at import time. Ethereum support is optional until contracts are
// deployed, and this module is imported by the settings page (to report status)
// as well as by routes that require it outright, so an eager check here would
// crash pages that merely display whether the integration is configured.
function requireEnv(name: RequiredEthereumEnvVar): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. Set it in .env.local before using the Ethereum integration.`,
    );
  }
  return value;
}

/** Masks an address to its first 6 characters for safe debug logging. */
function maskAddress(address: string): string {
  return `${address.slice(0, 6)}...`;
}

let providerInstance: JsonRpcProvider | undefined;

export function getProvider(): JsonRpcProvider {
  if (!providerInstance) {
    providerInstance = new JsonRpcProvider(requireEnv("ETHEREUM_RPC_URL"));
  }
  return providerInstance;
}

let adminWalletInstance: Wallet | undefined;

export function getAdminWallet(): Wallet {
  if (!adminWalletInstance) {
    adminWalletInstance = new Wallet(requireEnv("ADMIN_ETH_PRIVATE_KEY"), getProvider());
    console.debug(`[ethereum] admin wallet ready: ${maskAddress(adminWalletInstance.address)}`);
  }
  return adminWalletInstance;
}

let studentRegistryContractInstance: Contract | undefined;

export function getStudentRegistryContract(): Contract {
  if (!studentRegistryContractInstance) {
    studentRegistryContractInstance = new Contract(
      requireEnv("STUDENT_REGISTRY_ADDRESS"),
      studentRegistryAbi,
      getAdminWallet(),
    );
  }
  return studentRegistryContractInstance;
}

let walletBalanceContractInstance: Contract | undefined;

export function getWalletBalanceContract(): Contract {
  if (!walletBalanceContractInstance) {
    walletBalanceContractInstance = new Contract(
      requireEnv("WALLET_BALANCE_ADDRESS"),
      walletBalanceAbi,
      getProvider(),
    );
  }
  return walletBalanceContractInstance;
}
