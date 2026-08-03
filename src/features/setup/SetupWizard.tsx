"use client";

import { CheckCircle2, LoaderCircle, RefreshCw, Server, ShieldCheck, XCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";

import { checkAgentStatusAction, createOrGetDidAction, saveProfileAction } from "@/app/(auth)/setup/actions";

export type SetupProfile = {
  abbreviation: string;
  contactEmail: string;
  id: string;
  issuerDid: string | null;
  logoUrl: string | null;
  name: string;
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
  if (status === "online") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "offline") return "border-rose-200 bg-rose-50 text-rose-700";
  return "border-zinc-200 bg-zinc-50 text-zinc-600";
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
  const [logoUrl, setLogoUrl] = useState(profile?.logoUrl ?? "");
  const [contactEmail, setContactEmail] = useState(profile?.contactEmail ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [didStatus, setDidStatus] = useState<DidStatus>(profile?.issuerDid ? "complete" : "idle");
  const [error, setError] = useState<string | null>(null);

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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- health polling starts when the setup page mounts
    void runHealthCheck();
    const interval = window.setInterval(() => void runHealthCheck(), pollIntervalMs);
    return () => window.clearInterval(interval);
  }, [pollIntervalMs, runHealthCheck]);

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
    return "Ready to create the university issuer DID.";
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
      formData.append("logoUrl", logoUrl.trim());
      formData.append("contactEmail", contactEmail.trim());

      const nextProfile = await saveProfileAction(formData);
      setSavedProfile(nextProfile);
      setDidStatus(nextProfile.issuerDid ? "complete" : connectionReady ? "idle" : "waiting");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to save the university profile.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#f7f8fa] px-4 py-8 text-zinc-950">
      <main className="mx-auto max-w-6xl space-y-6">
        <header>
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">University onboarding</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-normal">Portal setup</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">
            Configure the university profile and issuer identity required for portal access.
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <section className="space-y-6">
            {savedProfile ? (
              <UniversityProfileCard
                didStatus={didStatus}
                onRetryDid={createDid}
                profile={savedProfile}
                setupComplete={setupComplete}
                setupMessage={setupMessage}
                connectionReady={connectionReady}
              />
            ) : (
              <section className="rounded-lg border border-zinc-200 bg-white">
                <div className="border-b border-zinc-200 px-5 py-4">
                  <h2 className="text-base font-semibold text-zinc-950">University profile</h2>
                  <p className="mt-1 text-sm text-zinc-600">These details identify the institution across the portal.</p>
                </div>

                <form className="space-y-5 p-5" onSubmit={handleSubmit}>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="text-sm">
                      <span className="font-medium text-zinc-700">University name</span>
                      <input
                        className="mt-2 h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-zinc-950 focus:ring-2 focus:ring-zinc-200"
                        disabled={isSaving}
                        onChange={(event) => setName(event.target.value)}
                        placeholder="University of Example"
                        required
                        value={name}
                      />
                    </label>

                    <label className="text-sm">
                      <span className="font-medium text-zinc-700">Abbreviation</span>
                      <input
                        className="mt-2 h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-zinc-950 focus:ring-2 focus:ring-zinc-200"
                        disabled={isSaving}
                        onChange={(event) => setAbbreviation(event.target.value)}
                        placeholder="UEX"
                        required
                        value={abbreviation}
                      />
                    </label>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="text-sm">
                      <span className="font-medium text-zinc-700">Contact email</span>
                      <input
                        className="mt-2 h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-zinc-950 focus:ring-2 focus:ring-zinc-200"
                        disabled={isSaving}
                        onChange={(event) => setContactEmail(event.target.value)}
                        placeholder="admin@example.edu"
                        required
                        type="email"
                        value={contactEmail}
                      />
                    </label>

                    <label className="text-sm">
                      <span className="font-medium text-zinc-700">Logo URL</span>
                      <input
                        className="mt-2 h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-zinc-950 focus:ring-2 focus:ring-zinc-200"
                        disabled={isSaving}
                        onChange={(event) => setLogoUrl(event.target.value)}
                        placeholder="https://example.edu/logo.png"
                        value={logoUrl}
                      />
                    </label>
                  </div>

                  {error ? (
                    <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
                  ) : null}

                  <button
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-zinc-950 px-4 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
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
          <section className="rounded-lg border border-zinc-200 bg-white">
            <div className="flex items-start justify-between gap-4 border-b border-zinc-200 px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-zinc-950">Connection</h2>
                <p className="mt-1 text-sm text-zinc-600">Identity agent status.</p>
              </div>
              <button
                className="inline-flex size-9 items-center justify-center rounded-md border border-zinc-300 text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => void runHealthCheck()}
                type="button"
              >
                <RefreshCw aria-hidden className="size-4" />
                <span className="sr-only">Retry connection check</span>
              </button>
            </div>

            <div className="space-y-3 p-5">
              <div className="rounded-md border border-zinc-200 px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-zinc-800">
                    <Server aria-hidden className="size-4 text-zinc-500" />
                    Identity agent
                  </div>
                  <StatusBadge status={health.agent} />
                </div>
                <p className="mt-2 flex items-center gap-2 text-sm text-zinc-600">
                  <ShieldCheck aria-hidden className="size-4 text-zinc-400" />
                  Ledger {ledgerDetailLabel(health.ledger)}
                </p>
              </div>
              {health.error ? <p className="text-sm leading-5 text-rose-700">{health.error}</p> : null}
              <p className="text-xs text-zinc-500">Last checked: {formatTimestamp(health.checkedAt)}</p>
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

function UniversityProfileCard({
  connectionReady,
  didStatus,
  onRetryDid,
  profile,
  setupComplete,
  setupMessage,
}: {
  connectionReady: boolean;
  didStatus: DidStatus;
  onRetryDid: () => Promise<void>;
  profile: SetupProfile;
  setupComplete: boolean;
  setupMessage: string;
}) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white">
      <div className="border-b border-zinc-200 px-5 py-4">
        <h2 className="text-base font-semibold text-zinc-950">
          {setupComplete ? "University profile complete" : "University profile created"}
        </h2>
        <p className="mt-1 text-sm text-zinc-600">{setupMessage}</p>
      </div>

      <dl className="grid gap-4 p-5 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-zinc-500">University</dt>
          <dd className="mt-1 font-medium text-zinc-950">{profile.name}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">Abbreviation</dt>
          <dd className="mt-1 font-medium text-zinc-950">{profile.abbreviation}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">Contact</dt>
          <dd className="mt-1 break-all font-medium text-zinc-950">{profile.contactEmail}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-zinc-500">Issuer DID</dt>
          <dd className="mt-1 break-all font-mono text-xs font-medium text-zinc-950">{didValue(profile, didStatus)}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">Completed</dt>
          <dd className="mt-1 font-medium text-zinc-950">{formatTimestamp(profile.setupCompletedAt)}</dd>
        </div>
      </dl>

      {setupComplete ? (
        <div className="flex flex-wrap gap-3 border-t border-zinc-200 px-5 py-4">
          <Link
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-zinc-950 px-4 text-sm font-medium text-white transition hover:bg-zinc-800"
            href="/credentials/schemas"
          >
            <ShieldCheck aria-hidden className="size-4" />
            Configure credential schema
          </Link>
          <Link
            className="inline-flex h-10 items-center justify-center rounded-md border border-zinc-300 px-4 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
            href="/"
          >
            Go to dashboard
          </Link>
        </div>
      ) : didStatus === "error" ? (
        <div className="border-t border-zinc-200 px-5 py-4">
          <button
            className="inline-flex h-10 items-center justify-center rounded-md border border-zinc-300 px-4 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!connectionReady}
            onClick={() => void onRetryDid()}
            type="button"
          >
            Retry DID creation
          </button>
        </div>
      ) : null}
    </section>
  );
}

function StatusBadge({ status }: { status: Reachability }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium ${statusTone(status)}`}>
      <StatusIcon status={status} />
      {statusLabel(status)}
    </span>
  );
}
