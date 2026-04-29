import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required").url(),
  DIRECT_URL: z.string().url().optional(),
  BETTER_AUTH_SECRET: z
    .string()
    .min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
  BETTER_AUTH_URL: z.string().url().default("http://localhost:3000"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  BOOTSTRAP_ADMIN_EMAIL: z
    .string()
    .min(1, "BOOTSTRAP_ADMIN_EMAIL is required")
    .email(),
  BOOTSTRAP_ADMIN_NAME: z
    .string()
    .min(1, "BOOTSTRAP_ADMIN_NAME is required"),
  BOOTSTRAP_ADMIN_PASSWORD: z
    .string()
    .min(12, "BOOTSTRAP_ADMIN_PASSWORD must be at least 12 characters"),
  ADMIN_INVITE_TTL_HOURS: z.coerce
    .number()
    .int()
    .positive()
    .default(24),
  AUTH_EMAIL_FROM: z.string().min(1, "AUTH_EMAIL_FROM is required"),
  NEXT_PUBLIC_API_BASE_URL: z.string().default("mock://unify-admin"),
});

export const env = envSchema.parse(process.env);

export const appConfig = {
  appName: "UNIFY Admin Portal",
  apiBaseUrl: env.NEXT_PUBLIC_API_BASE_URL,
  appUrl: env.APP_URL,
  authUrl: env.BETTER_AUTH_URL,
};
