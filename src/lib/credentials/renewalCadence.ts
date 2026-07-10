/**
 * Renewal cadence presets, in months. Kept dependency-free (no Prisma/DB
 * imports) so both `university/profile.ts` and `credentials/renewal.ts` can
 * import it without creating a circular dependency between the two.
 */
export const RENEWAL_CADENCE_PRESETS = [6, 12] as const;
export type RenewalCadenceMonths = (typeof RENEWAL_CADENCE_PRESETS)[number];
