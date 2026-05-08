"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ProfileStep } from "@/features/setup/steps/ProfileStep";
import { AgentCheckStep } from "@/features/setup/steps/AgentCheckStep";
import { DidStep } from "@/features/setup/steps/DidStep";
import { IssuanceSetupStep } from "@/features/setup/steps/IssuanceSetupStep";
import { CompleteStep } from "@/features/setup/steps/CompleteStep";

export type SetupProfile = {
  id: string;
  name: string;
  abbreviation: string;
  logoUrl: string | null;
  contactEmail: string;
  issuerDid: string | null;
  setupStatus: "PENDING" | "DID_CREATED" | "SCHEMA_CREATED" | "COMPLETE";
};

export type SetupSchema = {
  schemaId: string | null;
  credentialDefinitionId: string | null;
  revocationRegistryDefinitionId: string | null;
};

const steps = [
  "Profile",
  "Agent check",
  "DID",
  "Issuance",
  "Complete",
] as const;

export function SetupWizard({
  initialStep,
  profile,
  schema,
}: {
  initialStep: number;
  profile: SetupProfile | null;
  schema: SetupSchema | null;
}) {
  const [currentStep, setCurrentStep] = useState(initialStep);
  const router = useRouter();

  const retryRevocation = useMemo(() => {
    return (
      profile?.setupStatus === "SCHEMA_CREATED" &&
      !schema?.revocationRegistryDefinitionId
    );
  }, [profile, schema]);

  function handleNext() {
    setCurrentStep((step) => Math.min(step + 1, steps.length - 1));
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-[#f7f8fa] px-4 py-8 text-zinc-950">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            University onboarding
          </p>
          <h1 className="text-2xl font-semibold">Setup wizard</h1>
          <p className="text-sm text-zinc-600">
            Complete these steps to enable credential issuance for your
            university.
          </p>
        </header>

        <ol className="grid gap-2 sm:grid-cols-5">
          {steps.map((label, index) => {
            const isCurrent = index === currentStep;
            const isComplete = index < currentStep;

            return (
              <li
                key={label}
                className={`rounded-lg border px-3 py-2 text-sm ${
                  isCurrent
                    ? "border-zinc-900 bg-white text-zinc-950"
                    : isComplete
                      ? "border-zinc-200 bg-white text-zinc-600"
                      : "border-zinc-200 bg-zinc-50 text-zinc-400"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`grid size-6 place-items-center rounded-full text-xs font-semibold ${
                      isCurrent
                        ? "bg-zinc-900 text-white"
                        : isComplete
                          ? "bg-zinc-200 text-zinc-700"
                          : "bg-zinc-100 text-zinc-400"
                    }`}
                  >
                    {index + 1}
                  </span>
                  <span className="font-medium">{label}</span>
                </div>
              </li>
            );
          })}
        </ol>

        <section className="rounded-lg border border-zinc-200 bg-white p-6">
          {currentStep === 0 ? (
            <ProfileStep profile={profile} onComplete={handleNext} />
          ) : null}
          {currentStep === 1 ? (
            <AgentCheckStep onComplete={handleNext} />
          ) : null}
          {currentStep === 2 ? (
            <DidStep name={profile?.name ?? ""} onComplete={handleNext} />
          ) : null}
          {currentStep === 3 ? (
            <IssuanceSetupStep
              retryMode={retryRevocation}
              onComplete={handleNext}
            />
          ) : null}
          {currentStep === 4 ? (
            <CompleteStep
              issuerDid={profile?.issuerDid ?? ""}
              schemaId={schema?.schemaId ?? ""}
              credentialDefinitionId={schema?.credentialDefinitionId ?? ""}
            />
          ) : null}
        </section>
      </div>
    </div>
  );
}
