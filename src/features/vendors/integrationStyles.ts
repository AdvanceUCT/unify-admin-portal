/** Page-local styles; the shared portal tokens and type scale stay unchanged. */
export const integrationHeading = "text-2xl font-semibold leading-8 text-fg";
export const integrationSubheading = "text-lg font-semibold leading-7 text-fg";
export const integrationInput =
  "min-h-11 w-full min-w-0 rounded-md border border-border-strong bg-surface px-3 py-2 text-base text-fg outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/25 disabled:opacity-60";
export const integrationFocus =
  "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-600";
export const integrationButton = `inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-border-strong bg-surface px-4 py-2 text-base font-medium text-fg transition hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60 ${integrationFocus}`;
export const integrationPrimaryButton = `inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-brand-700 px-4 py-2 text-base font-semibold text-white transition hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-60 ${integrationFocus}`;
export type IntegrationBranch = {
  id: string;
  name: string;
  paymentEligible: boolean;
  isDefault?: boolean;
};
export type IntegrationFeedback = {
  kind: "success" | "error";
  text: string;
} | null;
