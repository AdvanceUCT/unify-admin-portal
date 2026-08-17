/**
 * @fileoverview Renders the Ethereum Network Card used by `/settings/EthereumNetworkCard.tsx`.
 * @module app/(admin)/settings/EthereumNetworkCard
 */

"use client";

import { Copy } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { IconButton } from "@/components/ui/IconButton";
import { SettingsField } from "./SettingsCard";

type NetworkStatus = {
  connected: boolean;
  network?: { name: string; chainId: number };
  blockNumber?: number;
  error?: string;
};

function AddressField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <SettingsField
      label={label}
      value={
        <div className="flex items-center gap-2">
          <code className="max-w-52 truncate text-xs text-fg" title={value}>
            {value}
          </code>
          <IconButton
            aria-label={`Copy ${label}`}
            onClick={copy}
            title={copied ? "Copied" : `Copy ${label}`}
            tone="ghost"
            type="button"
          >
            <Copy size={14} />
          </IconButton>
        </div>
      }
    />
  );
}

export function EthereumNetworkCard({
  adminKeyStatus,
  networkStatus,
  studentPaymentAddress,
  studentRegistryAddress,
  walletBalanceAddress,
}: {
  adminKeyStatus: "Configured" | "Not set";
  networkStatus: NetworkStatus;
  studentPaymentAddress: string;
  studentRegistryAddress: string;
  walletBalanceAddress: string;
}) {
  return (
    <div className="divide-y divide-border">
      <SettingsField
        label="Status"
        value={
          <Badge tone={networkStatus.connected ? "success" : "danger"}>
            {networkStatus.connected ? "Connected" : "Disconnected"}
          </Badge>
        }
      />
      <SettingsField label="Network" value="Sepolia (11155111)" />
      {networkStatus.connected ? (
        <SettingsField label="Block number" value={networkStatus.blockNumber ?? "Unknown"} />
      ) : (
        <SettingsField label="Error" value={networkStatus.error ?? "Unknown error"} />
      )}
      <AddressField label="Student registry address" value={studentRegistryAddress} />
      <AddressField label="Wallet balance address" value={walletBalanceAddress} />
      <AddressField label="Student payment address" value={studentPaymentAddress} />
      <SettingsField label="Admin Ethereum private key" value={adminKeyStatus} />
    </div>
  );
}
