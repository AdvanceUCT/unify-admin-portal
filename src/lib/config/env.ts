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
  RESEND_API_KEY: optionalNonEmptyString,
  CREDENTIAL_EMAIL_FROM: optionalNonEmptyString,
  CREDENTIAL_EMAIL_DELIVERY_MODE: z.enum(["resend", "console"]).default("resend"),
  WEBHOOK_SIGNING_SECRET: optionalNonEmptyString,
});

export const env = envSchema.parse(process.env);
