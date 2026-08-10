/**
 * @fileoverview Introduces the vendor application and resumes any current draft.
 * @module features/vendors/VendorApplicationLanding
 */

import Link from "next/link";
import {
  Building2,
  ClipboardCheck,
  FileCheck2,
  FileSignature,
  FileText,
  Mail,
  Save,
  ShieldCheck,
} from "lucide-react";

const WHAT_YOU_NEED = [
  {
    title: "Company registration certificate",
    description: "Official certificate from your company registry.",
    icon: Building2,
  },
  {
    title: "Proof of business address",
    description: "Utility bill, bank statement, or lease agreement (not older than 3 months).",
    icon: FileText,
  },
  {
    title: "Letter of authorisation",
    description: "Signed letter authorising the representative to submit this application.",
    icon: FileSignature,
  },
  {
    title: "Business & contact details",
    description: "Registration number, physical address, and a contact person's phone and email.",
    icon: FileCheck2,
  },
];

const HOW_IT_WORKS = [
  {
    title: "Tell us about your business",
    description: "Share your company details, registration number, and service category.",
  },
  {
    title: "Add your representative",
    description: "Provide the contact person authorised to manage this application.",
  },
  {
    title: "Upload your documents",
    description: "Attach the required certificates and identification.",
  },
  {
    title: "Submit for review",
    description: "Your application is sent to the university for review and a decision.",
  },
];

export function VendorApplicationLanding({
  universityName,
  supportEmail,
  applicationStatus,
}: {
  universityName?: string;
  supportEmail?: string;
  applicationStatus?: "DRAFT" | "PENDING" | "REJECTED" | "REVOKED";
}) {
  const ctaLabel =
    applicationStatus === "DRAFT"
      ? "Continue application"
      : applicationStatus
        ? "View application"
        : "Start application";
  const ctaHeading =
    applicationStatus === "DRAFT"
      ? "Ready to continue?"
      : applicationStatus
        ? "Track your application"
        : "Ready to get started?";
  const ctaDetail =
    applicationStatus === "DRAFT"
      ? "Pick up right where you left off."
      : applicationStatus
        ? "View the details and status of your submitted application."
        : "The application takes about 10–15 minutes to complete.";

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-surface p-5 shadow-md">
        <h2 className="text-section-title text-fg">About UNIFY</h2>
        <p className="mt-2 text-sm leading-6 text-fg-muted">
          UNIFY is {universityName ? `${universityName}'s` : "the university's"} digital
          credential verification network. Once your business is approved as a verifier, you can
          instantly confirm student status, standing, and eligibility using a secure QR code —
          no more manual document checks.
        </p>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="rounded-xl border border-border bg-surface p-5 shadow-md">
          <h2 className="text-section-title text-fg">What you&apos;ll need</h2>
          <p className="mt-1 text-sm text-fg-muted">
            Have these ready before you start so you can complete the application in one sitting.
          </p>
          <ul className="mt-4 space-y-4">
            {WHAT_YOU_NEED.map((item) => {
              const Icon = item.icon;
              return (
                <li className="flex gap-3" key={item.title}>
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700">
                    <Icon size={16} aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-sm font-medium text-fg">{item.title}</p>
                    <p className="mt-0.5 text-sm text-fg-muted">{item.description}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="rounded-xl border border-border bg-surface p-5 shadow-md">
          <h2 className="text-section-title text-fg">How the application works</h2>
          <ol className="mt-4 space-y-4">
            {HOW_IT_WORKS.map((step, index) => (
              <li className="flex gap-3" key={step.title}>
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-600 text-xs font-semibold text-white">
                  {index + 1}
                </span>
                <div>
                  <p className="text-sm font-medium text-fg">{step.title}</p>
                  <p className="mt-0.5 text-sm text-fg-muted">{step.description}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex items-start gap-3 rounded-xl border border-info-border bg-info-bg p-4 shadow-md">
          <Save className="mt-0.5 shrink-0 text-info-fg" size={20} aria-hidden="true" />
          <div>
            <p className="font-medium text-info-fg">Save and resume anytime</p>
            <p className="mt-1 text-sm text-info-fg">
              Your progress is saved automatically after every step. Exit whenever you need to —
              nothing will be lost.
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3 rounded-xl border border-info-border bg-info-bg p-4 shadow-md">
          <ClipboardCheck className="mt-0.5 shrink-0 text-info-fg" size={20} aria-hidden="true" />
          <div>
            <p className="font-medium text-info-fg">Reviewed by the university</p>
            <p className="mt-1 text-sm text-info-fg">
              Once submitted, {universityName ?? "the university"}&apos;s team will review your
              application. You&apos;ll be notified as soon as a decision is made.
            </p>
          </div>
        </div>
      </div>

      <section className="flex flex-col items-center gap-4 rounded-xl border border-border bg-surface p-8 text-center shadow-md">
        <span className="grid size-12 place-items-center rounded-full bg-brand-50 text-brand-700">
          <ShieldCheck size={24} aria-hidden="true" />
        </span>
        <div>
          <p className="font-medium text-fg">{ctaHeading}</p>
          <p className="mt-1 text-sm text-fg-muted">{ctaDetail}</p>
        </div>
        <Link
          className="inline-flex h-10 items-center rounded-md bg-brand-600 px-4 text-sm font-medium text-white transition hover:bg-brand-700"
          href={applicationStatus ? "/vendor/application" : "/vendor/application?start=1"}
        >
          {ctaLabel}
        </Link>
      </section>

      <section className="flex items-center gap-3 rounded-xl border border-border bg-surface p-5 shadow-md">
        <span className="grid size-10 shrink-0 place-items-center rounded-md bg-brand-50 text-brand-700">
          <Mail size={18} aria-hidden="true" />
        </span>
        <div>
          <p className="font-medium text-fg">Need help?</p>
          {supportEmail ? (
            <p className="text-sm text-fg-muted">
              Contact{" "}
              <a className="font-medium text-fg underline" href={`mailto:${supportEmail}`}>
                {supportEmail}
              </a>{" "}
              if you have any questions before you begin.
            </p>
          ) : (
            <p className="text-sm text-fg-muted">
              Contact your university administrator if you have any questions before you begin.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
