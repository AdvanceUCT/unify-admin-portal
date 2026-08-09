export const VERIFICATION_REASONS = [
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

export type VerificationReasonValue = (typeof VERIFICATION_REASONS)[number]["value"];

export const VERIFICATION_REASON_VALUES: string[] = VERIFICATION_REASONS.map((reason) => reason.value);

export const OTHER_VERIFICATION_REASON_VALUE: VerificationReasonValue = "other";

const VERIFICATION_REASON_LABELS = new Map<string, string>(
  VERIFICATION_REASONS.map((reason) => [reason.value, reason.label]),
);

/** Resolves selected verification reason values to their human-readable labels. */
export function verificationReasonLabels(
  values: string[],
  otherText?: string | null,
): string[] {
  return values.map((value) =>
    value === OTHER_VERIFICATION_REASON_VALUE && otherText
      ? `Other: ${otherText}`
      : (VERIFICATION_REASON_LABELS.get(value) ?? value),
  );
}

/** Renders selected verification reason values as a human-readable, comma-separated summary. */
export function formatVerificationReasons(
  values: string[],
  otherText?: string | null,
): string {
  return verificationReasonLabels(values, otherText).join(", ");
}
