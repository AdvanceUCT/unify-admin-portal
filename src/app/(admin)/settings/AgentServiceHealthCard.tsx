/**
 * @fileoverview Renders the Agent Service Health Card used by `/settings/AgentServiceHealthCard.tsx`.
 * @module app/(admin)/settings/AgentServiceHealthCard
 */

"use client";

import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/Badge";
import type { AgentHealth } from "@/lib/agentClient";
import { SettingsField } from "./SettingsCard";
import { checkAgentHealthAction } from "./actions";

export function AgentServiceHealthCard({
  apiKeyStatus,
  initialHealth,
  serviceUrlDisplay,
}: {
  apiKeyStatus: "Configured" | "Not set";
  initialHealth: AgentHealth;
  serviceUrlDisplay: string;
}) {
  const [health, setHealth] = useState(initialHealth);
  const [isPending, startTransition] = useTransition();

  function handleRefresh() {
    startTransition(async () => {
      const next = await checkAgentHealthAction();
      setHealth(next);
    });
  }

  return (
    <div>
      <div className="divide-y divide-border">
        <SettingsField
          label="Status"
          value={
            <Badge tone={health.ok ? "success" : "danger"}>
              {health.ok ? `Operational (${health.status})` : "Unreachable"}
            </Badge>
          }
        />
        {health.ok ? (
          <SettingsField
            label="Ledger"
            value={health.reachable ? "Reachable" : "Unreachable"}
          />
        ) : (
          <SettingsField label="Error" value={health.error} />
        )}
        <SettingsField label="Agent service URL" value={serviceUrlDisplay} />
        <SettingsField label="Agent API key" value={apiKeyStatus} />
      </div>

      <div className="mt-4 flex items-center gap-3 border-t border-border pt-4">
        <button
          className="h-9 rounded-md border border-border bg-surface px-3 text-sm font-medium text-fg-muted transition hover:border-border-strong hover:bg-surface-muted hover:text-fg disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isPending}
          onClick={handleRefresh}
          type="button"
        >
          {isPending ? "Checking..." : "Refresh"}
        </button>
        <span className="text-sm text-fg-subtle">
          Checked {new Date(health.checkedAt).toLocaleString()}
        </span>
      </div>
    </div>
  );
}
