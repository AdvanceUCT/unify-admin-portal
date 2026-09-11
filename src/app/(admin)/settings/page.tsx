/**
 * @fileoverview Renders the authenticated administrator page at `/settings`.
 * @module app/(admin)/settings/page
 */

import { Suspense } from "react";
import { Activity, Building, Clock, FileText, Gauge, Link as LinkIcon, Receipt, Webhook } from "lucide-react";
import Link from "next/link";

import { SettingsSectionLoading } from "@/components/layout/PortalRouteLoading";
import { checkAgentHealth, type AgentHealth } from "@/lib/agentClient";
import { ADMIN_ROLES, type AdminRole, ROLE_LABELS } from "@/lib/auth/permissions";
import { requireRoleForRender } from "@/lib/auth/session";
import { getBillingOperationsSummary, type BillingOperationsSummary } from "@/lib/billing/operationsSummary";
import { env } from "@/lib/config/env";
import { getDocumentSignedUrlForRender } from "@/lib/storage/supabase";
import { getActiveCredentialSchema } from "@/lib/university/credentialSchema";
import { getUniversityProfileForRender } from "@/lib/university/profile";
import { RenewalSettingsForm } from "./RenewalSettingsForm";
import { AgentServiceHealthCard } from "./AgentServiceHealthCard";
import { BillingOperationsCard } from "./BillingOperationsCard";
import { SettingsCard, SettingsField } from "./SettingsCard";
import { UniversityLogoUpload } from "./UniversityLogoUpload";
import { UniversityProfileForm } from "./UniversityProfileForm";

function configuredStatus(value: string | undefined | null): "Configured" | "Not set" {
  return value ? "Configured" : "Not set";
}

function handledResult<T>(promise: Promise<T>): Promise<PromiseSettledResult<T>> {
  return promise.then(
    (value) => ({ status: "fulfilled", value }),
    (reason) => ({ status: "rejected", reason }),
  );
}

async function readHandledResult<T>(resultPromise: Promise<PromiseSettledResult<T>>): Promise<T> {
  const result = await resultPromise;
  if (result.status === "rejected") throw result.reason;
  return result.value;
}

async function AgentServiceHealthSection({
  healthPromise,
}: {
  healthPromise: Promise<PromiseSettledResult<AgentHealth>>;
}) {
  const agentHealth = await readHandledResult(healthPromise);

  return (
    <AgentServiceHealthCard
      apiKeyStatus={configuredStatus(env.AGENT_API_KEY)}
      initialHealth={agentHealth}
      serviceUrlDisplay={env.AGENT_SERVICE_URL ?? "Not set"}
    />
  );
}

async function BillingOperationsSection({
  summaryPromise,
}: {
  summaryPromise: Promise<PromiseSettledResult<BillingOperationsSummary>>;
}) {
  const billingOperationsSummary = await readHandledResult(summaryPromise);

  return <BillingOperationsCard initialSummary={billingOperationsSummary} />;
}

export default async function SettingsPage() {
  const session = await requireRoleForRender(ADMIN_ROLES);

  const role = session.user.role as AdminRole;
  const canEditProfile = role === "SUPER_ADMIN" || role === "ADMIN";
  const canViewBillingOperations = role === "SUPER_ADMIN" || role === "ADMIN";
  const canManageVerificationBilling = role === "SUPER_ADMIN" || role === "ADMIN";
  const agentHealthPromise = handledResult(checkAgentHealth());
  const billingOperationsSummaryPromise = canViewBillingOperations
    ? handledResult(getBillingOperationsSummary())
    : null;

  const profile = await getUniversityProfileForRender();
  const [universityLogoUrl, activeSchema] = await Promise.all([
    profile?.logoPath ? getDocumentSignedUrlForRender(profile.logoPath) : null,
    profile ? getActiveCredentialSchema(profile.id) : null,
  ]);
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
        <Suspense
          fallback={
            <SettingsSectionLoading
              action
              label="Loading agent service health"
              rows={4}
            />
          }
        >
          <AgentServiceHealthSection healthPromise={agentHealthPromise} />
        </Suspense>
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

      {canManageVerificationBilling && (
        <SettingsCard
          description="Verification fee policy and invoice generation. Separate from the student payment wallet."
          icon={Receipt}
          title="Vendor verification billing"
        >
          <Link className="text-sm font-medium text-brand-700 hover:underline" href="/settings/verification-billing">
            Manage verification billing →
          </Link>
        </SettingsCard>
      )}

      {billingOperationsSummaryPromise && (
        <SettingsCard
          description="Job run history, backlog, and exception counts for vendor invoicing and Paystack payments."
          icon={Gauge}
          title="Billing operations"
        >
          <Suspense
            fallback={
              <SettingsSectionLoading
                action
                label="Loading billing operations"
                rows={8}
              />
            }
          >
            <BillingOperationsSection summaryPromise={billingOperationsSummaryPromise} />
          </Suspense>
        </SettingsCard>
      )}
    </div>
  );
}
