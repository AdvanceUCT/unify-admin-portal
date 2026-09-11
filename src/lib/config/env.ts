/**
 * @fileoverview Validates server and public environment variables at startup.
 * @module lib/config/env
 */

/*
 * This file checks the app's environment variables.
 * It makes sure required settings like database, auth, and email values
 * are valid before the rest of the app uses them.
 */
import { z } from "zod";

function isPlaceholderSupabaseUrl(value: string) {
  try {
    const url = new URL(value);
    const partsToCheck = [url.hostname, url.username, url.password];

    return partsToCheck.some((part) =>
      [
        "project-ref",
        "aws-0-region",
        "[project-ref]",
        "[db-region]",
        "[region]",
        "[your-password]",
      ].some((placeholder) => part.toLowerCase().includes(placeholder)),
    );
  } catch {
    return false;
  }
}

const databaseUrl = (name: string) =>
  z
    .string()
    .min(1, `${name} is required`)
    .url()
    .refine((value) => !isPlaceholderSupabaseUrl(value), {
      message: `${name} still contains placeholder Supabase values. Replace it with the real connection string from Supabase Dashboard > Connect.`,
    });

const optionalNonEmptyString = z
  .union([z.string().min(1), z.literal("")])
  .optional()
  .transform((value) => (value === "" ? undefined : value));

const optionalUrl = z
  .union([z.string().url(), z.literal("")])
  .optional()
  .transform((value) => (value === "" ? undefined : value));

const timeoutMs = (defaultValue: number) =>
  z
    .union([z.coerce.number().int().positive(), z.literal("")])
    .optional()
    .transform((value) => (value === "" || value === undefined ? defaultValue : value));

const optionalNonNegativeInteger = z.preprocess(
  (value) => {
    if (value === undefined) return undefined;
    if (typeof value === "string" && value.trim() === "") return undefined;
    return Number(value);
  },
  z.number().int().nonnegative().optional(),
).optional();

const optionalPositiveInteger = z.preprocess(
  (value) => {
    if (value === undefined) return undefined;
    if (typeof value === "string" && value.trim() === "") return undefined;
    return Number(value);
  },
  z.number().int().positive().optional(),
).optional();

const currencyCode = z
  .preprocess(
    (value) => (value === undefined || (typeof value === "string" && value.trim() === "") ? undefined : value),
    z.string().trim().regex(/^[A-Za-z]{3}$/).transform((value) => value.toUpperCase()).optional(),
  )
  .optional()
  .transform((value) => value ?? "ZAR");

// Rejects anything but "true"/"false" (case-insensitive) instead of silently
// coercing a typo like "yes" or "1" into a falsy feature flag.
const strictBooleanFlag = (name: string) =>
  z
    .string()
    .optional()
    .transform((value) => value?.trim() ?? "")
    .refine((value) => value === "" || value.toLowerCase() === "true" || value.toLowerCase() === "false", {
      message: `${name} must be "true" or "false".`,
    })
    .transform((value) => value.toLowerCase() === "true");

// This POC never accepts a live Paystack integration. Any other value is a
// misconfiguration, not a supported mode, so it fails fast instead of being coerced.
const paystackMode = z
  .string()
  .optional()
  .transform((value) => (value && value.trim() !== "" ? value.trim().toLowerCase() : "test"))
  .refine((value) => value === "test", {
    message: 'PAYSTACK_MODE must be "test". This deployment does not support live Paystack mode.',
  });

const PAYSTACK_PLACEHOLDER_VALUES = new Set([
  "sk_test_replace_in_private_env",
  "acct_replace_with_test_code",
  "replace_with_checked_integration_id",
]);

function isPaystackPlaceholder(value: string) {
  return PAYSTACK_PLACEHOLDER_VALUES.has(value.toLowerCase()) || value.toLowerCase().includes("replace");
}

const paystackSecretKey = optionalNonEmptyString.refine(
  (value) =>
    value === undefined || (value.startsWith("sk_test_") && !isPaystackPlaceholder(value)),
  {
    message:
      "PAYSTACK_SECRET_KEY must be a real Paystack test secret key (sk_test_...), never a live key or the setup-guide placeholder.",
  },
);

const paystackSubaccountCode = optionalNonEmptyString.refine(
  (value) => value === undefined || (value.startsWith("ACCT_") && !isPaystackPlaceholder(value)),
  {
    message:
      "PAYSTACK_PLATFORM_SUBACCOUNT_CODE must be a real Paystack subaccount code (ACCT_...), not the setup-guide placeholder.",
  },
);

const paystackIntegrationId = optionalNonEmptyString.refine(
  (value) => value === undefined || !isPaystackPlaceholder(value),
  {
    message: "PAYSTACK_EXPECTED_INTEGRATION_ID must not be left as the setup-guide placeholder.",
  },
);
const boundedPositiveInteger = (defaultValue: number, maximum: number) =>
  z
    .union([z.coerce.number().int().positive().max(maximum), z.literal("")])
    .optional()
    .transform((value) => (value === "" || value === undefined ? defaultValue : value));

const envSchema = z.object({
  DATABASE_URL: databaseUrl("DATABASE_URL"),
  DIRECT_URL: databaseUrl("DIRECT_URL").optional(),
  BETTER_AUTH_SECRET: z
    .string()
    .min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
  BETTER_AUTH_URL: z.string().url().default("http://localhost:3000"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  BOOTSTRAP_ADMIN_EMAIL: z
    .string()
    .min(1, "BOOTSTRAP_ADMIN_EMAIL is required")
    .email(),
  BOOTSTRAP_ADMIN_NAME: z.string().min(1, "BOOTSTRAP_ADMIN_NAME is required"),
  BOOTSTRAP_ADMIN_PASSWORD: z
    .string()
    .min(12, "BOOTSTRAP_ADMIN_PASSWORD must be at least 12 characters"),
  ADMIN_INVITE_TTL_HOURS: z.coerce.number().int().positive().default(24),
  ACTIVATION_PUBLIC_BASE_URL: optionalUrl,
  AUTH_EMAIL_FROM: z.string().min(1, "AUTH_EMAIL_FROM is required"),
  NEXT_PUBLIC_API_BASE_URL: z.string().default("mock://unify-admin"),
  SETUP_BYPASS: z
    .string()
    .optional()
    .transform((value) => value?.toLowerCase() === "true"),
  AGENT_SERVICE_URL: optionalUrl,
  AGENT_API_KEY: optionalNonEmptyString,
  AGENT_HEALTH_TIMEOUT_MS: timeoutMs(5_000),
  AGENT_STANDARD_TIMEOUT_MS: timeoutMs(15_000),
  AGENT_LONG_TIMEOUT_MS: timeoutMs(60_000),
  BATCH_ISSUANCE_PROCESSING_CONCURRENCY: boundedPositiveInteger(4, 16),
  RESEND_API_KEY: optionalNonEmptyString,
  CREDENTIAL_EMAIL_FROM: optionalNonEmptyString,
  CREDENTIAL_EMAIL_DELIVERY_MODE: z.enum(["resend", "console"]).default("resend"),
  VENDOR_HELP_EMAIL_FROM: optionalNonEmptyString,
  VENDOR_HELP_EMAIL_DELIVERY_MODE: z.enum(["resend", "console"]).default("resend"),
  WEBHOOK_SIGNING_SECRET: optionalNonEmptyString,
  CRON_SECRET: optionalNonEmptyString,
  VENDOR_API_KEY_PEPPER: optionalNonEmptyString,
  VENDOR_WEBHOOK_ENCRYPTION_KEY: optionalNonEmptyString,
  SUPABASE_URL: optionalUrl,
  SUPABASE_SERVICE_ROLE_KEY: optionalNonEmptyString,
  VERIFICATION_FEE_MINOR: optionalNonNegativeInteger,
  VERIFICATION_FEE_CURRENCY: currencyCode,
  VERIFICATION_INVOICING_ENABLED: strictBooleanFlag("VERIFICATION_INVOICING_ENABLED"),
  VERIFICATION_INVOICE_CHECKOUT_ENABLED: strictBooleanFlag("VERIFICATION_INVOICE_CHECKOUT_ENABLED"),
  PAYMENT_WALLET_TOPUPS_ENABLED: strictBooleanFlag("PAYMENT_WALLET_TOPUPS_ENABLED"),
  PAYMENT_TOPUP_MIN_MINOR: optionalPositiveInteger,
  PAYMENT_TOPUP_MAX_MINOR: optionalPositiveInteger,
  PAYMENT_OTP_EMAIL_FROM: optionalNonEmptyString,
  PAYMENT_OTP_EMAIL_OVERRIDE_TO: optionalNonEmptyString,
  PAYMENT_OTP_DEBUG_LOG_CODE: strictBooleanFlag("PAYMENT_OTP_DEBUG_LOG_CODE"),
  PAYMENT_OTP_BYPASS_ENABLED: strictBooleanFlag("PAYMENT_OTP_BYPASS_ENABLED"),
  PAYMENT_OTP_PEPPER: optionalNonEmptyString,
  PAYSTACK_MODE: paystackMode,
  PAYSTACK_SECRET_KEY: paystackSecretKey,
  PAYSTACK_ACCOUNT_REF: optionalNonEmptyString,
  PAYSTACK_PLATFORM_SUBACCOUNT_CODE: paystackSubaccountCode,
  PAYSTACK_EXPECTED_INTEGRATION_ID: paystackIntegrationId,
});

const parsedEnv = envSchema.parse(process.env);

if (process.env.NODE_ENV === "production" && parsedEnv.VERIFICATION_FEE_MINOR === undefined) {
  throw new Error("VERIFICATION_FEE_MINOR is required in production.");
}

// Checkout moves real (test-mode) money through Paystack, so its required
// identity must be fully configured before the flag can be turned on — the
// invoicing flag alone only issues/displays invoices and needs no provider.
if (parsedEnv.VERIFICATION_INVOICE_CHECKOUT_ENABLED) {
  const missing = [
    ["PAYSTACK_SECRET_KEY", parsedEnv.PAYSTACK_SECRET_KEY],
    ["PAYSTACK_PLATFORM_SUBACCOUNT_CODE", parsedEnv.PAYSTACK_PLATFORM_SUBACCOUNT_CODE],
    ["PAYSTACK_EXPECTED_INTEGRATION_ID", parsedEnv.PAYSTACK_EXPECTED_INTEGRATION_ID],
  ].filter(([, value]) => value === undefined).map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(
      `VERIFICATION_INVOICE_CHECKOUT_ENABLED requires ${missing.join(", ")} to be configured.`,
    );
  }
}

if (parsedEnv.PAYMENT_WALLET_TOPUPS_ENABLED) {
  const missing = [
    ["PAYSTACK_SECRET_KEY", parsedEnv.PAYSTACK_SECRET_KEY],
    ["PAYSTACK_EXPECTED_INTEGRATION_ID", parsedEnv.PAYSTACK_EXPECTED_INTEGRATION_ID],
    ...(parsedEnv.PAYMENT_OTP_BYPASS_ENABLED
      ? []
      : [
          ["PAYMENT_OTP_EMAIL_FROM", parsedEnv.PAYMENT_OTP_EMAIL_FROM],
          ["PAYMENT_OTP_PEPPER", parsedEnv.PAYMENT_OTP_PEPPER],
          ["RESEND_API_KEY", parsedEnv.RESEND_API_KEY],
        ]),
  ].filter(([, value]) => value === undefined).map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(
      `PAYMENT_WALLET_TOPUPS_ENABLED requires ${missing.join(", ")} to be configured.`,
    );
  }
  if (!parsedEnv.PAYMENT_OTP_BYPASS_ENABLED && (parsedEnv.PAYMENT_OTP_PEPPER?.length ?? 0) < 32) {
    throw new Error("PAYMENT_OTP_PEPPER must be at least 32 characters.");
  }
}

const paymentTopupMinMinor = parsedEnv.PAYMENT_TOPUP_MIN_MINOR ?? 1_000;
const paymentTopupMaxMinor = parsedEnv.PAYMENT_TOPUP_MAX_MINOR ?? 500_000;

if (paymentTopupMinMinor > paymentTopupMaxMinor) {
  throw new Error("PAYMENT_TOPUP_MIN_MINOR must be less than or equal to PAYMENT_TOPUP_MAX_MINOR.");
}

export const env = {
  ...parsedEnv,
  VERIFICATION_FEE_MINOR: parsedEnv.VERIFICATION_FEE_MINOR ?? 0,
  PAYMENT_TOPUP_MIN_MINOR: paymentTopupMinMinor,
  PAYMENT_TOPUP_MAX_MINOR: paymentTopupMaxMinor,
  PAYSTACK_ACCOUNT_REF: parsedEnv.PAYSTACK_ACCOUNT_REF ?? "university-demo",
};
