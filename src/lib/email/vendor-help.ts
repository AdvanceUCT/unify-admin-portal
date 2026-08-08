import "server-only";

import { env } from "@/lib/config/env";
import { escapeHtml, sendResendEmail, type EmailDeliveryResult } from "@/lib/email/resend";

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

function emailText(input: VendorHelpRequestEmailInput) {
  return [
    "A vendor submitted a help request from the UNIFY Vendor Portal.",
    "",
    `Title: ${input.title}`,
    "",
    "Details:",
    input.details,
    "",
    "Vendor metadata:",
    ...vendorMetadataLines(input),
  ].join("\n");
}

function emailHtml(input: VendorHelpRequestEmailInput) {
  const metadata = vendorMetadataLines(input)
    .map((line) => `<li>${escapeHtml(line)}</li>`)
    .join("\n");

  return [
    "<p>A vendor submitted a help request from the UNIFY Vendor Portal.</p>",
    `<p><strong>Title:</strong> ${escapeHtml(input.title)}</p>`,
    "<p><strong>Details:</strong></p>",
    `<p>${escapeHtml(input.details).replace(/\n/g, "<br />")}</p>`,
    "<p><strong>Vendor metadata:</strong></p>",
    `<ul>${metadata}</ul>`,
  ].join("\n");
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
    html: emailHtml(input),
    replyTo: input.submittedBy.email,
    subject: `[UNIFY Vendor Help] ${input.title}`,
    text: emailText(input),
    to: input.to,
  });
}
