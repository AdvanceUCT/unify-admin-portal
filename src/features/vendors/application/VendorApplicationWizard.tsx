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
  verificationReasons: string[];
  otherVerificationReason: string;
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
  initialUnlockedStep = 1,
  initialApplicationId,
  initialData,
  initialFilenames,
}: {
  initialStep: number;
  initialUnlockedStep?: number;
  initialApplicationId: string | null;
  initialData: DraftApplicationData;
  initialFilenames?: Record<string, string>;
}) {
  const [currentStep, setCurrentStep] = useState(initialStep);
  const [applicationId, setApplicationId] = useState(initialApplicationId);
  // The furthest step the vendor has already reached data-wise — steps up to this
  // point are safe to jump straight to from the step header (e.g. when resubmitting
  // with most fields already carried over, or after completing later steps this session).
  const [unlockedStep, setUnlockedStep] = useState(Math.max(initialStep, initialUnlockedStep));
  const router = useRouter();

  function goToStep(step: number) {
    setCurrentStep(step);
    router.replace(`/vendor/application?step=${step}`, { scroll: false });
  }

  function handleNext(newApplicationId?: string) {
    if (newApplicationId) setApplicationId(newApplicationId);
    const nextStep = Math.min(currentStep + 1, STEP_LABELS.length);
    setUnlockedStep((prev) => Math.max(prev, nextStep));
    goToStep(nextStep);
    router.refresh();
  }

  function handleBack() {
    goToStep(Math.max(currentStep - 1, 1));
  }

  return (
    <div className="space-y-6">
      <ol className="grid gap-2 sm:grid-cols-6">
        {STEP_LABELS.map((label, index) => {
          const stepNumber = index + 1;
          const isCurrent = stepNumber === currentStep;
          const isUnlocked = stepNumber <= unlockedStep;

          return (
            <li key={label}>
              <button
                type="button"
                aria-current={isCurrent ? "step" : undefined}
                disabled={!isUnlocked}
                onClick={() => {
                  if (isUnlocked && !isCurrent) goToStep(stepNumber);
                }}
                title={isUnlocked ? undefined : "Complete the earlier steps first"}
                className={`w-full rounded-lg border px-3 py-2 text-left text-caption transition ${
                  isCurrent
                    ? "border-brand-600 bg-surface text-fg"
                    : isUnlocked
                      ? "cursor-pointer border-border bg-surface text-fg-muted hover:border-border-strong hover:bg-surface-muted"
                      : "cursor-not-allowed border-border bg-surface-muted text-fg-subtle"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`grid size-5 shrink-0 place-items-center rounded-full text-caption font-semibold ${
                      isCurrent
                        ? "bg-brand-600 text-white"
                        : isUnlocked
                          ? "bg-surface-muted text-fg-muted"
                          : "bg-surface-muted text-fg-subtle"
                    }`}
                  >
                    {stepNumber}
                  </span>
                  <span className="font-medium leading-tight">{label}</span>
                </div>
              </button>
            </li>
          );
        })}
      </ol>

      <section className="rounded-lg border border-border bg-surface p-6 shadow-md">
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
