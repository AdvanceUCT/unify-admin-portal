import {
  Activity,
  Building,
  Clock,
  FileText,
  Link as LinkIcon,
  UserPlus,
  Webhook,
} from "lucide-react";

import { SectionHeader } from "@/components/layout/SectionHeader";
import { checkAgentHealth } from "@/lib/agentClient";
import { ADMIN_ROLES, ROLE_LABELS, type AdminRole } from "@/lib/auth/permissions";
import { requireRole } from "@/lib/auth/session";
import { env } from "@/lib/config/env";
import { getActiveCredentialSchema } from "@/lib/university/credentialSchema";
import { getUniversityProfile } from "@/lib/university/profile";
import { AgentServiceHealthCard } from "./AgentServiceHealthCard";
import { SettingsCard, SettingsField } from "./SettingsCard";
import { UniversityProfileForm } from "./UniversityProfileForm";

function configuredStatus(value: string | undefined | null): "Configured" | "Not set" {
  return value ? "Configured" : "Not set";
}

function truncate(value: string | undefined | null, maxLength: number) {
  if (!value) return "Not set";
  return value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;
}

export default async function SettingsPage() {
  const session = await requireRole(ADMIN_ROLES);

  const role = session.user.role as AdminRole;
  const canEditProfile = role === "SUPER_ADMIN" || role === "ADMIN";

  const profile = await getUniversityProfile();
  const activeSchema = profile ? await getActiveCredentialSchema(profile.id) : null;
  const agentHealth = await checkAgentHealth();

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Settings"
        description="Central location to view and configure key system values."
      />

      <p className="text-sm text-zinc-500">
        Signed in as{" "}
        <span className="font-medium text-zinc-900">{session.user.name}</span>{" "}
        ({session.user.email}) &middot; {ROLE_LABELS[role]}
      </p>

      <SettingsCard
        description="Editable details shown across activation emails and the verifier-facing profile."
        icon={Building}
        title="University profile"
      >
        {profile ? (
          canEditProfile ? (
            <UniversityProfileForm
              abbreviation={profile.abbreviation}
              contactEmail={profile.contactEmail}
              name={profile.name}
              websiteUrl={profile.websiteUrl ?? ""}
            />
          ) : (
            <div className="divide-y divide-zinc-100">
              <SettingsField label="University name" value={profile.name} />
              <SettingsField label="Abbreviation" value={profile.abbreviation} />
              <SettingsField label="Contact email" value={profile.contactEmail} />
              <SettingsField label="Website URL" value={profile.websiteUrl ?? "Not set"} />
            </div>
          )
        ) : (
          <p className="text-sm text-zinc-500">
            No university profile exists yet. Complete the setup wizard first.
          </p>
        )}
      </SettingsCard>

      <SettingsCard
        description="Live reachability of the Identity Agent Service used for issuance and verification."
        icon={Activity}
        title="Agent service health"
      >
        <AgentServiceHealthCard
          apiKeyStatus={configuredStatus(env.AGENT_API_KEY)}
          initialHealth={agentHealth}
          serviceUrlDisplay={truncate(env.AGENT_SERVICE_URL, 20)}
        />
      </SettingsCard>

      <SettingsCard
        description="The active student credential schema anchored on the ledger. Read only."
        icon={FileText}
        title="Credential configuration"
      >
        {activeSchema ? (
          <div className="divide-y divide-zinc-100">
            <SettingsField label="Schema version" value={activeSchema.schemaVersion} />
            <SettingsField label="Schema ID" value={activeSchema.schemaId ?? "Not set"} />
            <SettingsField
              label="Credential definition ID"
              value={activeSchema.credentialDefinitionId ?? "Not set"}
            />
            <SettingsField
              label="Revocation registry definition ID"
              value={activeSchema.revocationRegistryDefinitionId ?? "Not set"}
            />
            <SettingsField label="Issuer DID" value={profile?.issuerDid ?? "Not set"} />
          </div>
        ) : (
          <p className="text-sm text-zinc-500">No active credential schema yet.</p>
        )}
      </SettingsCard>

      <SettingsCard
        description="Base URL and expiry used for credential activation links. Requires a redeployment to change."
        icon={LinkIcon}
        title="Activation link settings"
      >
        <div className="divide-y divide-zinc-100">
          <SettingsField
            label="Activation public base URL"
            value={env.ACTIVATION_PUBLIC_BASE_URL ?? "Not set"}
          />
          <SettingsField
            label="Admin invite TTL"
            value={`${env.ADMIN_INVITE_TTL_HOURS} hours`}
          />
        </div>
      </SettingsCard>

      <SettingsCard
        description="Signing secret and endpoint used to receive agent event webhooks. Read only."
        icon={Webhook}
        title="Webhook configuration"
      >
        <div className="divide-y divide-zinc-100">
          <SettingsField
            label="Webhook signing secret"
            value={configuredStatus(env.WEBHOOK_SIGNING_SECRET)}
          />
          <SettingsField
            label="Registered webhook endpoint"
            value={env.AGENT_SERVICE_URL ?? "Not set"}
          />
        </div>
      </SettingsCard>

      <SettingsCard
        description="How long an admin invite link remains valid before it expires. Read only."
        icon={UserPlus}
        title="Admin invite settings"
      >
        <div className="divide-y divide-zinc-100">
          <SettingsField
            label="Invite expiry"
            value={
              <span className="flex items-center gap-1.5">
                <Clock className="size-3.5 text-zinc-400" aria-hidden="true" />
                {env.ADMIN_INVITE_TTL_HOURS} hours after an invite is sent
              </span>
            }
          />
        </div>
      </SettingsCard>
    </div>
  );
}
