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

export const TOTAL_STEPS = STEP_LABELS.length;

export function VendorApplicationWizard({
  initialStep,
  initialApplicationId,
  initialData,
  initialFilenames,
}: {
  initialStep: number;
  initialApplicationId: string | null;
  initialData: DraftApplicationData;
  initialFilenames?: Record<string, string>;
}) {
  const [currentStep, setCurrentStep] = useState(initialStep);
  const [maxStepReached, setMaxStepReached] = useState(initialStep);
  const [applicationId, setApplicationId] = useState(initialApplicationId);
  const router = useRouter();

  function goToStep(step: number) {
    setCurrentStep(step);
    setMaxStepReached((prev) => Math.max(prev, step));
    router.replace(`/vendor/application?step=${step}`, { scroll: false });
  }

  function handleNext(newApplicationId?: string) {
    if (newApplicationId) setApplicationId(newApplicationId);
    goToStep(Math.min(currentStep + 1, STEP_LABELS.length));
    router.refresh();
  }

  function handleBack() {
    goToStep(Math.max(currentStep - 1, 1));
  }

  function handleStepTabClick(step: number) {
    if (step === currentStep || step > maxStepReached) return;
    goToStep(step);
  }

  return (
    <div className="space-y-6">
      <ol className="grid gap-2 sm:grid-cols-6">
        {STEP_LABELS.map((label, index) => {
          const stepNumber = index + 1;
          const isCurrent = stepNumber === currentStep;
          const isComplete = stepNumber <= maxStepReached && !isCurrent;
          const isClickable = stepNumber !== currentStep && stepNumber <= maxStepReached;

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
              <button
                type="button"
                onClick={() => handleStepTabClick(stepNumber)}
                disabled={!isClickable}
                aria-current={isCurrent ? "step" : undefined}
                className={`flex w-full items-center gap-2 text-left ${
                  isClickable ? "cursor-pointer" : "cursor-default"
                }`}
              >
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
              </button>
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
            initialFilenames={initialFilenames}
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
            onEditStep={goToStep}
          />
        )}
      </section>
    </div>
  );
}
