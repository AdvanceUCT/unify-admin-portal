/**
 * @fileoverview Presents the complete vendor application for final review.
 * @module features/vendors/application/steps/StepReview
 */

"use client";

import { Pencil } from "lucide-react";
import { useActionState } from "react";
import { submitApplicationAction } from "@/app/vendor/(portal)/application/actions";
import { formatVerificationReasons } from "@/lib/vendors/verification-reasons";
import type { DraftApplicationData } from "../VendorApplicationWizard";

function ReviewRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex gap-4 px-4 py-2.5 text-body">
      <span className="w-44 shrink-0 text-fg-subtle">{label}</span>
      <span className="text-fg">{value}</span>
    </div>
  );
}

function ReviewSection({
  title,
  step,
  onEditStep,
  children,
}: {
  title: string;
  step: number;
  onEditStep: (step: number) => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5">
        <h3 className="text-caption font-semibold uppercase tracking-wide text-fg-subtle">{title}</h3>
        <button
          aria-label={`Edit ${title}`}
          className="text-fg-muted transition hover:text-fg"
          onClick={() => onEditStep(step)}
          type="button"
        >
          <Pencil className="size-4" />
        </button>
      </div>
      <div className="divide-y divide-border rounded-lg border border-border bg-surface">
        {children}
      </div>
    </div>
  );
}

export function StepReview({
  applicationId,
  initialData,
  onBack,
  onEditStep,
}: {
  applicationId: string;
  initialData: DraftApplicationData;
  onBack: () => void;
  onEditStep: (step: number) => void;
}) {
  const [state, formAction, isPending] = useActionState(submitApplicationAction, { ok: false });

  if (state.ok) {
    return (
      <div className="space-y-4 py-8 text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-full bg-success-bg text-2xl text-success-fg">
          ✓
        </div>
        <h2 className="text-section-title text-fg">Application submitted</h2>
        <p className="mx-auto max-w-sm text-body text-fg-muted">
          Your verifier application is under review. We&apos;ll notify you by email once a decision
          has been made.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-section-title text-fg">Review your application</h2>
        <p className="mt-1 text-body text-fg-muted">
          Check all details before submitting. Once submitted, the university will review your
          application.
        </p>
      </div>

      <div className="space-y-5">
        <ReviewSection title="Organisation information" step={1} onEditStep={onEditStep}>
          <ReviewRow label="Company name" value={initialData.companyName} />
          <ReviewRow label="Trading name" value={initialData.tradingName} />
          <ReviewRow label="Registration number" value={initialData.companyRegistrationNumber} />
          <ReviewRow label="Organisation type" value={initialData.organisationType} />
          <ReviewRow label="Service category" value={initialData.serviceCategory} />
          <ReviewRow label="Website" value={initialData.website} />
          <ReviewRow label="Physical address" value={initialData.physicalAddress} />
          <ReviewRow label="Postal address" value={initialData.postalAddress} />
        </ReviewSection>

        <ReviewSection title="Authorised representative" step={2} onEditStep={onEditStep}>
          <ReviewRow label="Full name" value={initialData.contactPersonName} />
          <ReviewRow label="Work email" value={initialData.contactEmail} />
          <ReviewRow label="Job title" value={initialData.contactJobTitle} />
          <ReviewRow label="Phone" value={initialData.contactPhone} />
          <ReviewRow label="Employee number" value={initialData.contactEmployeeNumber} />
          <ReviewRow label="Preferred contact" value={initialData.preferredContactMethod} />
        </ReviewSection>

        <ReviewSection title="Verification requirements" step={3} onEditStep={onEditStep}>
          <ReviewRow
            label="Reasons for access"
            value={formatVerificationReasons(
              initialData.verificationReasons,
              initialData.otherVerificationReason,
            )}
          />
          <ReviewRow label="Additional info" value={initialData.additionalInfo} />
        </ReviewSection>

        <ReviewSection title="Supporting documents" step={4} onEditStep={onEditStep}>
          {(
            [
              ["Registration certificate", initialData.docRegistrationCertificate],
              ["Proof of address", initialData.docProofOfAddress],
              ["Representative ID", initialData.docRepresentativeId],
              ["Letter of authorisation", initialData.docLetterOfAuthorisation],
              ["Tax compliance", initialData.docTaxCompliance],
              ["Business licence", initialData.docBusinessLicence],
            ] as [string, string | null][]
          ).map(
            ([label, path]) =>
              path && (
                <div key={label} className="flex gap-4 px-4 py-2.5 text-body">
                  <span className="w-44 shrink-0 text-fg-subtle">{label}</span>
                  <span className="text-success-fg">Uploaded</span>
                </div>
              ),
          )}
        </ReviewSection>

        <ReviewSection title="Declaration" step={5} onEditStep={onEditStep}>
          <div className="flex gap-4 px-4 py-2.5 text-body">
            <span className="w-44 shrink-0 text-fg-subtle">Accepted</span>
            <span className="text-fg">
              {initialData.declarationAccepted ? "Yes" : "No"}
            </span>
          </div>
        </ReviewSection>
      </div>

      {state.error && (
        <p className="rounded-md border border-danger-border bg-danger-bg px-3 py-2 text-body text-danger-fg">
          {state.error}
        </p>
      )}

      <form action={formAction}>
        <input name="applicationId" type="hidden" value={applicationId} />
        <div className="flex justify-between">
          <button
            className="h-11 rounded-md border border-border px-5 text-sm font-medium text-fg-muted transition hover:border-border-strong hover:bg-surface-muted"
            disabled={isPending}
            onClick={onBack}
            type="button"
          >
            Back
          </button>
          <button
            className="h-11 rounded-md bg-brand-600 px-5 text-sm font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isPending}
            type="submit"
          >
            {isPending ? "Submitting..." : "Submit application"}
          </button>
        </div>
      </form>
    </div>
  );
}
