/**
 * @fileoverview Sends vendor support requests to the configured help address.
 * @module lib/email/vendor-help
 */

import "server-only";

import { renderVendorHelpRequestEmail } from "./templates";

import { env } from "@/lib/config/env";
import { sendResendEmail, type EmailDeliveryResult } from "@/lib/email/resend";

type VendorHelpRequestEmailInput = {
  to: string;
  title: string;
  details: string;
  submittedAt?: Date;
  submittedBy: {
    name: string;
    email: string;
  };
  vendor: {
    companyName?: string | null;
    contactEmail?: string | null;
    contactPersonName?: string | null;
    role?: string | null;
    serviceCategory?: string | null;
  };
};

function vendorMetadataLines(input: VendorHelpRequestEmailInput) {
  return [
    `Submitted at: ${(input.submittedAt ?? new Date()).toISOString()}`,
    `Submitted by: ${input.submittedBy.name} <${input.submittedBy.email}>`,
    `Vendor: ${input.vendor.companyName ?? "Unknown"}`,
    `Portal role: ${input.vendor.role ?? "Unknown"}`,
    `Contact person: ${input.vendor.contactPersonName ?? "Unknown"}`,
    `Vendor contact email: ${input.vendor.contactEmail ?? "Unknown"}`,
    `Service category: ${input.vendor.serviceCategory ?? "Unknown"}`,
  ];
}

function shouldUseConsoleDelivery() {
  return (
    env.VENDOR_HELP_EMAIL_DELIVERY_MODE === "console" ||
    (!env.RESEND_API_KEY && process.env.NODE_ENV !== "production")
  );
}

export async function sendVendorHelpRequestEmail(
  input: VendorHelpRequestEmailInput,
): Promise<EmailDeliveryResult> {
  if (shouldUseConsoleDelivery()) {
    console.info(
      [
        "Vendor help request email delivery is using the development logger.",
        `To: ${input.to}`,
        `Reply-To: ${input.submittedBy.email}`,
        `Title: ${input.title}`,
        ...vendorMetadataLines(input),
        "",
        input.details,
      ].join("\n"),
    );
    return { provider: "console" };
  }

  if (!env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is required to send vendor help request emails.");
  }
  if (!env.VENDOR_HELP_EMAIL_FROM) {
    throw new Error("VENDOR_HELP_EMAIL_FROM is required to send vendor help request emails.");
  }

  return sendResendEmail({
    apiKey: env.RESEND_API_KEY,
    from: env.VENDOR_HELP_EMAIL_FROM,
    ...renderVendorHelpRequestEmail(input),
    replyTo: input.submittedBy.email,
    to: input.to,
  });
}
