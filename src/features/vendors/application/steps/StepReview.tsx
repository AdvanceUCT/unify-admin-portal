"use client";

import { useActionState } from "react";
import { submitApplicationAction } from "@/app/vendor/(portal)/application/actions";
import type { DraftApplicationData } from "../VendorApplicationWizard";

function ReviewRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex gap-4 px-4 py-2.5 text-sm">
      <span className="w-44 shrink-0 text-zinc-500">{label}</span>
      <span className="text-zinc-800">{value}</span>
    </div>
  );
}

function ReviewSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
        {title}
      </h3>
      <div className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 bg-white">
        {children}
      </div>
    </div>
  );
}

export function StepReview({
  applicationId,
  initialData,
  onBack,
}: {
  applicationId: string;
  initialData: DraftApplicationData;
  onBack: () => void;
}) {
  const [state, formAction, isPending] = useActionState(submitApplicationAction, { ok: false });

  if (state.ok) {
    return (
      <div className="space-y-4 py-8 text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-full bg-emerald-50 text-2xl">
          ✓
        </div>
        <h2 className="text-lg font-semibold">Application submitted</h2>
        <p className="mx-auto max-w-sm text-sm text-zinc-600">
          Your verifier application is under review. We&apos;ll notify you by email once a decision
          has been made.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Review your application</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Check all details before submitting. Once submitted, the university will review your
          application.
        </p>
      </div>

      <div className="space-y-5">
        <ReviewSection title="Organisation information">
          <ReviewRow label="Company name" value={initialData.companyName} />
          <ReviewRow label="Trading name" value={initialData.tradingName} />
          <ReviewRow label="Registration number" value={initialData.companyRegistrationNumber} />
          <ReviewRow label="Organisation type" value={initialData.organisationType} />
          <ReviewRow label="Service category" value={initialData.serviceCategory} />
          <ReviewRow label="Website" value={initialData.website} />
          <ReviewRow label="Physical address" value={initialData.physicalAddress} />
          <ReviewRow label="Postal address" value={initialData.postalAddress} />
        </ReviewSection>

        <ReviewSection title="Authorised representative">
          <ReviewRow label="Full name" value={initialData.contactPersonName} />
          <ReviewRow label="Work email" value={initialData.contactEmail} />
          <ReviewRow label="Job title" value={initialData.contactJobTitle} />
          <ReviewRow label="Phone" value={initialData.contactPhone} />
          <ReviewRow label="Employee number" value={initialData.contactEmployeeNumber} />
          <ReviewRow label="Preferred contact" value={initialData.preferredContactMethod} />
        </ReviewSection>

        <ReviewSection title="Verification requirements">
          <ReviewRow label="Purpose" value={initialData.justification} />
          <ReviewRow label="Intended use" value={initialData.description} />
          <ReviewRow label="Additional info" value={initialData.additionalInfo} />
        </ReviewSection>

        <ReviewSection title="Supporting documents">
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
                <div key={label} className="flex gap-4 px-4 py-2.5 text-sm">
                  <span className="w-44 shrink-0 text-zinc-500">{label}</span>
                  <span className="text-emerald-600">Uploaded</span>
                </div>
              ),
          )}
        </ReviewSection>

        <ReviewSection title="Declaration">
          <div className="flex gap-4 px-4 py-2.5 text-sm">
            <span className="w-44 shrink-0 text-zinc-500">Accepted</span>
            <span className="text-zinc-800">
              {initialData.declarationAccepted ? "Yes" : "No"}
            </span>
          </div>
        </ReviewSection>
      </div>

      {state.error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <form action={formAction}>
        <input name="applicationId" type="hidden" value={applicationId} />
        <div className="flex justify-between">
          <button
            className="h-11 rounded-md border border-zinc-300 px-5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
            disabled={isPending}
            onClick={onBack}
            type="button"
          >
            Back
          </button>
          <button
            className="h-11 rounded-md bg-zinc-950 px-5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
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
