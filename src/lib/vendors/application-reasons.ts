/**
 * @fileoverview Normalizes safe user-facing explanations for a vendor's reason for application.
 * @module lib/vendors/application-reasons
 */

export const APPLICATION_REASONS = [
  { value: "student_discounts", label: "Verify student eligibility for discounts" },
  { value: "student_exclusive_products", label: "Provide student-exclusive products or services" },
  { value: "student_accommodation", label: "Verify eligibility for student accommodation" },
  { value: "financial_products", label: "Verify student status for financial products" },
  {
    value: "internships_graduate_programmes",
    label: "Verify eligibility for internships or graduate programmes",
  },
  { value: "student_events_programmes", label: "Verify access to student events or programmes" },
  {
    value: "healthcare_wellness",
    label: "Verify eligibility for healthcare or wellness services partners",
  },
  { value: "transport_travel", label: "Verify eligibility for transport or travel benefits" },
  { value: "software_digital_services", label: "Verify eligibility for software or digital services" },
  { value: "other", label: "Other" },
] as const;

export type ApplicationReasonValue = (typeof APPLICATION_REASONS)[number]["value"];

export const APPLICATION_REASON_VALUES: string[] = APPLICATION_REASONS.map((reason) => reason.value);

export const OTHER_APPLICATION_REASON_VALUE: ApplicationReasonValue = "other";

const APPLICATION_REASON_LABELS = new Map<string, string>(
  APPLICATION_REASONS.map((reason) => [reason.value, reason.label]),
);

/** Resolves selected application reason values to their human-readable labels. */
export function applicationReasonLabels(
  values: string[],
  otherText?: string | null,
): string[] {
  return values.map((value) =>
    value === OTHER_APPLICATION_REASON_VALUE && otherText
      ? `Other: ${otherText}`
      : (APPLICATION_REASON_LABELS.get(value) ?? value),
  );
}

/** Renders selected application reason values as a human-readable, comma-separated summary. */
export function formatApplicationReasons(
  values: string[],
  otherText?: string | null,
): string {
  return applicationReasonLabels(values, otherText).join(", ");
}
