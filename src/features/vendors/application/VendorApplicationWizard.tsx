"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Step1OrgInfo } from "./steps/Step1OrgInfo";
import { Step2Representative } from "./steps/Step2Representative";
import { Step3VerificationRequirements } from "./steps/Step3VerificationRequirements";
import { Step4Documents } from "./steps/Step4Documents";
import { Step5Declaration } from "./steps/Step5Declaration";
import { StepReview } from "./steps/StepReview";

export type DraftApplicationData = {
  companyName: string;
  companyRegistrationNumber: string;
  serviceCategory: string;
  website: string;
  tradingName: string;
  organisationType: string;
  physicalAddress: string;
  postalAddress: string;
  contactPersonName: string;
  contactEmail: string;
  contactJobTitle: string;
  contactPhone: string;
  contactEmployeeNumber: string;
  preferredContactMethod: string;
  justification: string;
  description: string;
  additionalInfo: string;

  docRegistrationCertificate: string | null;
  docProofOfAddress: string | null;
  docRepresentativeId: string | null;
  docLetterOfAuthorisation: string | null;
  docTaxCompliance: string | null;
  docBusinessLicence: string | null;
  declarationAccepted: boolean;
};

const STEP_LABELS = [
  "Organisation",
  "Representative",
  "Verification",
  "Documents",
  "Declaration",
  "Review",
] as const;

export function VendorApplicationWizard({
  initialStep,
  initialApplicationId,
  initialData,
}: {
  initialStep: number;
  initialApplicationId: string | null;
  initialData: DraftApplicationData;
}) {
  const [currentStep, setCurrentStep] = useState(initialStep);
  const [applicationId, setApplicationId] = useState(initialApplicationId);
  const router = useRouter();

  function handleNext(newApplicationId?: string) {
    if (newApplicationId) setApplicationId(newApplicationId);
    setCurrentStep((s) => Math.min(s + 1, STEP_LABELS.length));
    router.refresh();
  }

  function handleBack() {
    setCurrentStep((s) => Math.max(s - 1, 1));
  }

  return (
    <div className="space-y-6">
      <ol className="grid gap-2 sm:grid-cols-6">
        {STEP_LABELS.map((label, index) => {
          const stepNumber = index + 1;
          const isCurrent = stepNumber === currentStep;
          const isComplete = stepNumber < currentStep;

          return (
            <li
              key={label}
              className={`rounded-lg border px-3 py-2 text-xs ${
                isCurrent
                  ? "border-zinc-900 bg-white text-zinc-950"
                  : isComplete
                    ? "border-zinc-200 bg-white text-zinc-600"
                    : "border-zinc-200 bg-zinc-50 text-zinc-400"
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`grid size-5 shrink-0 place-items-center rounded-full text-xs font-semibold ${
                    isCurrent
                      ? "bg-zinc-900 text-white"
                      : isComplete
                        ? "bg-zinc-200 text-zinc-700"
                        : "bg-zinc-100 text-zinc-400"
                  }`}
                >
                  {stepNumber}
                </span>
                <span className="font-medium leading-tight">{label}</span>
              </div>
            </li>
          );
        })}
      </ol>

      <section className="rounded-lg border border-zinc-200 bg-white p-6">
        {currentStep === 1 && (
          <Step1OrgInfo
            initialData={initialData}
            onComplete={(id) => handleNext(id)}
          />
        )}
        {currentStep === 2 && applicationId && (
          <Step2Representative
            applicationId={applicationId}
            initialData={initialData}
            onComplete={() => handleNext()}
            onBack={handleBack}
          />
        )}
        {currentStep === 3 && applicationId && (
          <Step3VerificationRequirements
            applicationId={applicationId}
            initialData={initialData}
            onComplete={() => handleNext()}
            onBack={handleBack}
          />
        )}
        {currentStep === 4 && applicationId && (
          <Step4Documents
            applicationId={applicationId}
            initialData={initialData}
            onComplete={() => handleNext()}
            onBack={handleBack}
          />
        )}
        {currentStep === 5 && applicationId && (
          <Step5Declaration
            applicationId={applicationId}
            initialData={initialData}
            onComplete={() => handleNext()}
            onBack={handleBack}
          />
        )}
        {currentStep === 6 && applicationId && (
          <StepReview
            applicationId={applicationId}
            initialData={initialData}
            onBack={handleBack}
          />
        )}
      </section>
    </div>
  );
}
