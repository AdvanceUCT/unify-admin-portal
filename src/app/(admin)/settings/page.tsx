/**
 * @fileoverview Renders the authenticated administrator page at `/settings`.
 * @module app/(admin)/settings/page
 */

import { Activity, Building, Clock, FileText, Link as LinkIcon, Webhook } from "lucide-react";

import { checkAgentHealth } from "@/lib/agentClient";
import { ADMIN_ROLES, ROLE_LABELS, type AdminRole } from "@/lib/auth/permissions";
import { requireRole } from "@/lib/auth/session";
import { env } from "@/lib/config/env";
import { getDocumentSignedUrl } from "@/lib/storage/supabase";
import { getActiveCredentialSchema } from "@/lib/university/credentialSchema";
import { getUniversityProfile } from "@/lib/university/profile";
import { RenewalSettingsForm } from "./RenewalSettingsForm";
import { AgentServiceHealthCard } from "./AgentServiceHealthCard";
import { SettingsCard, SettingsField } from "./SettingsCard";
import { UniversityLogoUpload } from "./UniversityLogoUpload";
import { UniversityProfileForm } from "./UniversityProfileForm";

function configuredStatus(value: string | undefined | null): "Configured" | "Not set" {
  return value ? "Configured" : "Not set";
}

export default async function SettingsPage() {
  const session = await requireRole(ADMIN_ROLES);

  const role = session.user.role as AdminRole;
  const canEditProfile = role === "SUPER_ADMIN" || role === "ADMIN";

  const profile = await getUniversityProfile();
  const universityLogoUrl = profile?.logoPath ? await getDocumentSignedUrl(profile.logoPath) : null;
  const activeSchema = profile ? await getActiveCredentialSchema(profile.id) : null;
  const agentHealth = await checkAgentHealth();
  const webhookEndpoint = new URL("/api/webhooks/agent", env.APP_URL).toString();

  return (
    <div className="space-y-6">
      <p className="text-sm text-fg-subtle">
        Signed in as{" "}
        <span className="font-medium text-fg">{session.user.name}</span>{" "}
        ({session.user.email}) &middot; {ROLE_LABELS[role]}
      </p>

      <SettingsCard
        description="Editable details and branding shown across the admin portal, activation emails, and verifier-facing profile."
        icon={Building}
        title="University profile"
      >
        {profile ? (
          canEditProfile ? (
            <div className="space-y-5">
              <div>
                <p className="mb-3 text-sm font-medium text-fg-muted">University logo</p>
                <UniversityLogoUpload initialLogoUrl={universityLogoUrl} />
              </div>
              <div className="border-t border-border pt-5">
                <UniversityProfileForm
                  abbreviation={profile.abbreviation}
                  contactEmail={profile.contactEmail}
                  name={profile.name}
                  websiteUrl={profile.websiteUrl ?? ""}
                />
              </div>
            </div>
          ) : (
            <div className="divide-y divide-border">
              <SettingsField
                label="University logo"
                value={universityLogoUrl ? "Uploaded" : "Not set"}
              />
              <SettingsField label="University name" value={profile.name} />
              <SettingsField label="Abbreviation" value={profile.abbreviation} />
              <SettingsField label="Contact email" value={profile.contactEmail} />
              <SettingsField label="Website URL" value={profile.websiteUrl ?? "Not set"} />
            </div>
          )
        ) : (
          <p className="text-sm text-fg-subtle">
            No university profile exists yet. Complete the setup wizard first.
          </p>
        )}
      </SettingsCard>

      <SettingsCard
        description="Default credential validity window and renewal cadence applied to new issuances."
        icon={Clock}
        title="Validity & renewal"
      >
        {profile ? (
          <RenewalSettingsForm
            cadenceMonths={profile.renewalCadenceMonths}
            enabled={profile.automaticCredentialRenewalEnabled}
            validityDays={profile.defaultCredentialValidityDays}
          />
        ) : (
          <p className="text-sm text-fg-subtle">
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
          serviceUrlDisplay={env.AGENT_SERVICE_URL ?? "Not set"}
        />
      </SettingsCard>

      <SettingsCard
        description="The active student credential schema anchored on the ledger. Read only."
        icon={FileText}
        title="Credential configuration"
      >
        {activeSchema ? (
          <div className="divide-y divide-border">
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
          <p className="text-sm text-fg-subtle">No active credential schema yet.</p>
        )}
      </SettingsCard>

      <SettingsCard
        description="Base URL and expiry used for credential activation links and admin invites. Requires a redeployment to change."
        icon={LinkIcon}
        title="Activation link settings"
      >
        <div className="divide-y divide-border">
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
        <div className="divide-y divide-border">
          <SettingsField
            label="Webhook signing secret"
            value={configuredStatus(env.WEBHOOK_SIGNING_SECRET)}
          />
          <SettingsField
            label="Portal webhook endpoint"
            value={webhookEndpoint}
          />
        </div>
      </SettingsCard>
    </div>
  );
}
