/**
 * @fileoverview Guides first-time university profile, agent, DID, and issuance setup.
 * @module features/setup/SetupWizard
 */

"use client";

import { Building2, CheckCircle2, LoaderCircle, RefreshCw, Server, ShieldCheck, XCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";

import { Badge } from "@/components/ui/Badge";
import { IconButton } from "@/components/ui/IconButton";
import { checkAgentStatusAction, createOrGetDidAction, saveProfileAction } from "@/app/(auth)/setup/actions";
import { toSafeImageSrc } from "@/lib/url";

export type SetupProfile = {
  abbreviation: string;
  contactEmail: string;
  id: string;
  issuerDid: string | null;
  logoUrl: string | null;
  name: string;
  paymentWalletEnabled: boolean;
  setupCompletedAt: string | null;
  setupStatus: "PENDING" | "DID_CREATED" | "SCHEMA_CREATED" | "COMPLETE";
};

type Reachability = "checking" | "offline" | "online";

type HealthState = {
  agent: Reachability;
  checkedAt?: string;
  error?: string;
  ledger: Reachability;
};

type DidStatus = "idle" | "waiting" | "creating" | "complete" | "error";

const emptyHealth: HealthState = {
  agent: "checking",
  ledger: "checking",
};

function statusTone(status: Reachability) {
  if (status === "online") return "success" as const;
  if (status === "offline") return "danger" as const;
  return "neutral" as const;
}

function statusLabel(status: Reachability) {
  if (status === "online") return "Online";
  if (status === "offline") return "Offline";
  return "Checking";
}

function StatusIcon({ status }: { status: Reachability }) {
  if (status === "online") return <CheckCircle2 aria-hidden className="size-4" />;
  if (status === "offline") return <XCircle aria-hidden className="size-4" />;
  return <LoaderCircle aria-hidden className="size-4 animate-spin" />;
}

function formatTimestamp(value?: string | null) {
  if (!value) return "Not available";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function SetupWizard({
  pollIntervalMs = 10000,
  profile,
}: {
  pollIntervalMs?: number;
  profile: SetupProfile | null;
}) {
  const router = useRouter();
  const [savedProfile, setSavedProfile] = useState(profile);
  const [health, setHealth] = useState<HealthState>(emptyHealth);
  const [name, setName] = useState(profile?.name ?? "");
  const [abbreviation, setAbbreviation] = useState(profile?.abbreviation ?? "");
  const [contactEmail, setContactEmail] = useState(profile?.contactEmail ?? "");
  const [paymentWalletEnabled, setPaymentWalletEnabled] = useState(profile?.paymentWalletEnabled ?? true);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const logoObjectUrlRef = useRef<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [didStatus, setDidStatus] = useState<DidStatus>(profile?.issuerDid ? "complete" : "idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () => () => {
      if (logoObjectUrlRef.current) URL.revokeObjectURL(logoObjectUrlRef.current);
    },
    [],
  );

  function handleLogoFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    if (logoObjectUrlRef.current) URL.revokeObjectURL(logoObjectUrlRef.current);
    logoObjectUrlRef.current = file ? URL.createObjectURL(file) : null;
    setLogoPreviewUrl(logoObjectUrlRef.current);
    setLogoFile(file);
  }

  function clearLogoFile() {
    if (logoObjectUrlRef.current) URL.revokeObjectURL(logoObjectUrlRef.current);
    logoObjectUrlRef.current = null;
    setLogoPreviewUrl(null);
    setLogoFile(null);
  }

  const connectionReady = health.agent === "online" && health.ledger === "online";
  const setupComplete = Boolean(savedProfile?.issuerDid && savedProfile.setupStatus === "COMPLETE");

  const runHealthCheck = useCallback(async () => {
    setHealth((current) => ({
      ...current,
      agent: current.agent === "online" ? "online" : "checking",
      ledger: current.ledger === "online" ? "online" : "checking",
    }));

    const result = await checkAgentStatusAction();
    setHealth({
      agent: result.agent.reachable ? "online" : "offline",
      checkedAt: result.checkedAt,
      error: result.error,
      ledger: result.ledger.reachable ? "online" : "offline",
    });
  }, []);

  const createDid = useCallback(async () => {
    if (!savedProfile || savedProfile.issuerDid) return;

    setError(null);
    setDidStatus("creating");

    try {
      const result = await createOrGetDidAction();
      setSavedProfile(result.profile);
      setDidStatus("complete");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to create the university DID.");
      setDidStatus("error");
    }
  }, [router, savedProfile]);

  useEffect(() => {
    if (savedProfile?.issuerDid) return;

    // eslint-disable-next-line react-hooks/set-state-in-effect -- health polling starts when the setup page mounts
    void runHealthCheck();
    const interval = window.setInterval(() => void runHealthCheck(), pollIntervalMs);
    return () => window.clearInterval(interval);
  }, [pollIntervalMs, runHealthCheck, savedProfile?.issuerDid]);

  useEffect(() => {
    if (!savedProfile || savedProfile.issuerDid || !connectionReady) return;
    if (didStatus !== "idle" && didStatus !== "waiting") return;

    // eslint-disable-next-line react-hooks/set-state-in-effect -- DID creation is triggered by profile + connectivity readiness
    void createDid();
  }, [connectionReady, createDid, didStatus, savedProfile]);

  const setupMessage = useMemo(() => {
    if (setupComplete) return "University account setup is complete.";
    if (!savedProfile) return "Enter the university profile to start setup.";
    if (!connectionReady) return "Profile saved. Waiting for the agent and ledger to come online.";
    if (didStatus === "creating") return "Creating the university issuer DID.";
    if (didStatus === "error") return "DID creation needs attention.";
    return "Creating the university issuer DID.";
  }, [connectionReady, didStatus, savedProfile, setupComplete]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!name.trim() || !abbreviation.trim() || !contactEmail.trim()) {
      setError("Name, abbreviation, and contact email are required.");
      return;
    }

    setIsSaving(true);
    try {
      const formData = new FormData();
      formData.append("name", name.trim());
      formData.append("abbreviation", abbreviation.trim());
      formData.append("contactEmail", contactEmail.trim());
      if (paymentWalletEnabled) formData.append("paymentWalletEnabled", "on");
      if (logoFile) formData.append("file", logoFile);

      const nextProfile = await saveProfileAction(formData);
      setSavedProfile(nextProfile);
      setDidStatus(nextProfile.issuerDid ? "complete" : connectionReady ? "idle" : "waiting");
      clearLogoFile();
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to save the university profile.");
    } finally {
      setIsSaving(false);
    }
  }

  const safeLogoPreviewSrc = toSafeImageSrc(logoPreviewUrl);

  return (
    <div className="min-h-screen bg-canvas px-4 py-8">
      <main className="mx-auto max-w-6xl space-y-6">
        <header>
          <p className="text-caption font-medium uppercase tracking-wide text-fg-subtle">University onboarding</p>
          <h1 className="mt-2 text-page-title text-fg">Portal setup</h1>
          <p className="mt-2 max-w-2xl text-body leading-6 text-fg-muted">
            Configure the university profile and issuer identity required for portal access.
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <section className="space-y-6">
            {setupComplete && savedProfile ? (
              <UniversityProfileCard
                didStatus={didStatus}
                profile={savedProfile}
                setupMessage={setupMessage}
              />
            ) : savedProfile ? (
              <ProfileCreationStatusCard
                connectionReady={connectionReady}
                didStatus={didStatus}
                onRetryDid={createDid}
              />
            ) : (
              <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-md">
                <div className="border-b border-border px-5 py-4">
                  <h2 className="text-section-title text-fg">University profile</h2>
                  <p className="mt-1 text-body text-fg-muted">These details identify the institution across the portal.</p>
                </div>

                <form className="space-y-5 p-5" onSubmit={handleSubmit}>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="text-sm">
                      <span className="font-medium text-fg">University name</span>
                      <input
                        className="mt-2 h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-fg outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                        disabled={isSaving}
                        onChange={(event) => setName(event.target.value)}
                        placeholder="University of Example"
                        required
                        value={name}
                      />
                    </label>

                    <label className="text-sm">
                      <span className="font-medium text-fg">Abbreviation</span>
                      <input
                        className="mt-2 h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-fg outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                        disabled={isSaving}
                        onChange={(event) => setAbbreviation(event.target.value)}
                        placeholder="UEX"
                        required
                        value={abbreviation}
                      />
                    </label>
                  </div>

                  <label className="block text-sm">
                    <span className="font-medium text-fg">Contact email</span>
                    <input
                      className="mt-2 h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-fg outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                      disabled={isSaving}
                      onChange={(event) => setContactEmail(event.target.value)}
                      placeholder="admin@example.edu"
                      required
                      type="email"
                      value={contactEmail}
                    />
                  </label>

                  <label className="flex items-start gap-3 rounded-md border border-border bg-surface-muted px-3 py-3 text-sm">
                    <input
                      checked={paymentWalletEnabled}
                      className="mt-1"
                      disabled={isSaving}
                      name="paymentWalletEnabled"
                      onChange={(event) => setPaymentWalletEnabled(event.target.checked)}
                      type="checkbox"
                    />
                    <span>
                      <span className="font-medium text-fg">Enable payment wallet</span>
                      <span className="block text-fg-subtle">
                        Turn on student wallet payments for this instance and provision the required clearing accounts.
                      </span>
                    </span>
                  </label>

                  <div>
                    <span className="block text-sm font-medium text-fg">
                      Logo <span className="ml-1 font-normal text-fg-subtle">(optional)</span>
                    </span>
                    <div className="mt-2 flex items-center gap-3">
                      <div className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-md border border-border bg-surface-muted">
                        {safeLogoPreviewSrc ? (
                          // eslint-disable-next-line @next/next/no-img-element -- local object URL preview, not compatible with next/image
                          <img alt="" className="size-full object-contain" src={safeLogoPreviewSrc} />
                        ) : (
                          <Building2 aria-hidden="true" className="size-5 text-fg-subtle" />
                        )}
                      </div>
                      <label
                        className={`inline-flex h-9 items-center rounded-md border px-3 text-sm font-medium transition ${
                          isSaving
                            ? "cursor-not-allowed border-border bg-surface-muted text-fg-subtle"
                            : "cursor-pointer border-border bg-surface text-fg-muted hover:border-border-strong hover:bg-surface-muted"
                        }`}
                      >
                        {logoFile ? "Change logo" : "Upload logo"}
                        <input
                          accept="image/png,image/jpeg,image/webp"
                          className="sr-only"
                          disabled={isSaving}
                          onChange={handleLogoFileChange}
                          type="file"
                        />
                      </label>
                      {logoFile ? (
                        <button
                          className="text-sm font-medium text-fg-subtle transition hover:text-fg"
                          disabled={isSaving}
                          onClick={clearLogoFile}
                          type="button"
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-fg-subtle">PNG, JPEG, or WEBP. Max 2 MB.</p>
                  </div>

                  {error ? (
                    <p className="rounded-md border border-danger-border bg-danger-bg px-3 py-2 text-sm text-danger-fg">{error}</p>
                  ) : null}

                  <button
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-brand-600 px-4 text-sm font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={isSaving}
                    type="submit"
                  >
                    {isSaving ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : null}
                    {isSaving ? "Saving profile" : "Save profile"}
                  </button>
                </form>
              </section>
            )}
          </section>

          <aside>
            <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-md">
              <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
                <div>
                  <h2 className="text-section-title text-fg">Connection</h2>
                  <p className="mt-1 text-body text-fg-muted">Identity agent status.</p>
                </div>
                <IconButton aria-label="Retry connection check" onClick={() => void runHealthCheck()}>
                  <RefreshCw aria-hidden className="size-4" />
                </IconButton>
              </div>

              <div className="space-y-3 p-5">
                <div className="rounded-md border border-border px-3 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-fg">
                      <Server aria-hidden className="size-4 text-fg-subtle" />
                      Identity agent
                    </div>
                    <Badge tone={statusTone(health.agent)}>
                      <span className="flex items-center gap-1">
                        <StatusIcon status={health.agent} />
                        {statusLabel(health.agent)}
                      </span>
                    </Badge>
                  </div>
                  <p className="mt-2 flex items-center gap-2 text-sm text-fg-muted">
                    <ShieldCheck aria-hidden className="size-4 text-fg-subtle" />
                    Ledger {ledgerDetailLabel(health.ledger)}
                  </p>
                </div>
                {health.error ? <p className="text-sm leading-5 text-danger-fg">{health.error}</p> : null}
                <p className="text-caption text-fg-subtle">Last checked: {formatTimestamp(health.checkedAt)}</p>
              </div>
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
}

function didValue(profile: SetupProfile, didStatus: DidStatus) {
  if (profile.issuerDid) return profile.issuerDid;
  if (didStatus === "creating") return "Creating issuer DID";
  if (didStatus === "waiting") return "Waiting for connection";
  if (didStatus === "error") return "Not created";
  return "Pending";
}

function ledgerDetailLabel(status: Reachability) {
  if (status === "online") return "reachable";
  if (status === "offline") return "not reachable";
  return "checking";
}

function ProfileCreationStatusCard({
  connectionReady,
  didStatus,
  onRetryDid,
}: {
  connectionReady: boolean;
  didStatus: DidStatus;
  onRetryDid: () => Promise<void>;
}) {
  const hasError = didStatus === "error";

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-md">
      <div className="flex items-center gap-3 px-5 py-5">
        <span
          className={`inline-flex size-9 shrink-0 items-center justify-center rounded-md border ${
            hasError ? "border-danger-border bg-danger-bg text-danger-fg" : "border-border bg-surface-muted text-fg-muted"
          }`}
        >
          {hasError ? <XCircle aria-hidden className="size-5" /> : <LoaderCircle aria-hidden className="size-5 animate-spin" />}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-section-title text-fg">Creating profile</h2>
          {hasError ? (
            <button
              className="mt-4 inline-flex h-10 items-center justify-center rounded-md border border-border px-4 text-sm font-medium text-fg-muted transition hover:border-border-strong hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!connectionReady}
              onClick={() => void onRetryDid()}
              type="button"
            >
              Retry DID creation
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function UniversityProfileCard({
  didStatus,
  profile,
  setupMessage,
}: {
  didStatus: DidStatus;
  profile: SetupProfile;
  setupMessage: string;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-md">
      <div className="border-b border-border px-5 py-4">
        <h2 className="text-section-title text-fg">University profile complete</h2>
        <p className="mt-1 text-body text-fg-muted">{setupMessage}</p>
      </div>

      <dl className="grid gap-4 p-5 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-fg-subtle">University</dt>
          <dd className="mt-1 font-medium text-fg">{profile.name}</dd>
        </div>
        <div>
          <dt className="text-fg-subtle">Abbreviation</dt>
          <dd className="mt-1 font-medium text-fg">{profile.abbreviation}</dd>
        </div>
        <div>
          <dt className="text-fg-subtle">Contact</dt>
          <dd className="mt-1 break-all font-medium text-fg">{profile.contactEmail}</dd>
        </div>
        <div>
          <dt className="text-fg-subtle">Payment wallet</dt>
          <dd className="mt-1 font-medium text-fg">{profile.paymentWalletEnabled ? "Enabled" : "Disabled"}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-fg-subtle">Issuer DID</dt>
          <dd className="mt-1 break-all font-mono text-xs font-medium text-fg">{didValue(profile, didStatus)}</dd>
        </div>
        <div>
          <dt className="text-fg-subtle">Completed</dt>
          <dd className="mt-1 font-medium text-fg">{formatTimestamp(profile.setupCompletedAt)}</dd>
        </div>
      </dl>

      <div className="flex flex-wrap gap-3 border-t border-border px-5 py-4">
        <Link
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-brand-600 px-4 text-sm font-medium text-white transition hover:bg-brand-700"
          href="/credentials/schemas"
        >
          <ShieldCheck aria-hidden className="size-4" />
          Configure credential schema
        </Link>
        <Link
          className="inline-flex h-10 items-center justify-center rounded-md border border-border px-4 text-sm font-medium text-fg-muted transition hover:border-border-strong hover:bg-surface-muted"
          href="/"
        >
          Go to dashboard
        </Link>
      </div>
    </section>
  );
}
