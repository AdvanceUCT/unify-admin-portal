/** Content shared by live senders, previews and their plain-text alternatives. */
import { emailDate, renderEmail } from "./layout";

const studentFooter = "Student Wallet · Identity and payment access";
const adminFooter = "UNIFY Admin Portal · Account access";
const vendorFooter = "UNIFY Vendor Portal · Application and account updates";

export function renderPaymentOtpEmail(input: { studentName: string; otp: string }) {
  return renderEmail({ subject: "Your UNIFY payment activation code", preview: "Enter your code in the Student Wallet. It expires in 10 minutes.", category: "PAYMENT ACTIVATION", heading: "Your activation code", footer: studentFooter, blocks: [
    { kind: "paragraph", text: `Hi ${input.studentName},` },
    { kind: "paragraph", text: "Enter this code in the UNIFY Student Wallet to activate payment access." },
    { kind: "code", value: input.otp, expiry: "It expires in 10 minutes." },
    { kind: "paragraph", text: "Never share this code. If you did not request it, you can ignore this email." },
  ] });
}

export function renderCredentialActivationEmail(input: { studentName: string; activationUrl: string; expiresAt: string }) {
  return renderEmail({ subject: "Your UNIFY student credential is ready", preview: "Open the Student Wallet to review and accept your credential.", category: "STUDENT CREDENTIAL", heading: "Your credential is ready", footer: studentFooter, blocks: [
    { kind: "paragraph", text: `Hi ${input.studentName},` },
    { kind: "paragraph", text: "Your student credential is ready to add to the UNIFY Student Wallet." },
    { kind: "paragraph", text: "Open this email on the phone with the Student Wallet installed, then review and accept your credential in the app." },
    { kind: "notice", text: `This activation link expires at ${emailDate(input.expiresAt)}.` },
    { kind: "action", label: "Open Student Wallet", url: input.activationUrl, fallback: "If the button does not open the wallet, copy this link into the browser on the phone with the Student Wallet installed:" },
  ] });
}

export function renderAdminInviteEmail(input: { name: string; inviteUrl: string; expiresAt: Date }) {
  return renderEmail({ subject: "You are invited to UNIFY Admin", preview: "Accept your invitation and set up your admin account.", category: "ADMIN INVITATION", heading: "Join UNIFY Admin", footer: adminFooter, blocks: [
    { kind: "paragraph", text: `Hi ${input.name},` },
    { kind: "paragraph", text: "You have been invited to the UNIFY Admin Portal. Accept your invitation to set up your account." },
    { kind: "notice", text: `This invitation expires at ${emailDate(input.expiresAt)}.` },
    { kind: "action", label: "Accept invitation", url: input.inviteUrl },
  ] });
}

export function renderPasswordResetEmail(input: { name: string; resetUrl: string; expiresInMinutes: number }) {
  return renderEmail({ subject: "Reset your UNIFY Admin Portal password", preview: "Use this link to choose a new password for your account.", category: "ACCOUNT ACCESS", heading: "Reset your password", footer: adminFooter, blocks: [
    { kind: "paragraph", text: `Hi ${input.name},` },
    { kind: "paragraph", text: "We received a request to reset your UNIFY Admin Portal password." },
    { kind: "notice", text: `This link expires in ${input.expiresInMinutes} minutes.` },
    { kind: "action", label: "Reset password", url: input.resetUrl },
    { kind: "paragraph", text: "If you did not request this, ignore this email. Your password has not changed." },
  ] });
}

export function renderVendorStaffInviteEmail(input: { name: string; vendorName: string; inviteUrl: string; expiresAt: Date }) {
  return renderEmail({ subject: `Join ${input.vendorName} on UNIFY`, preview: "Accept your staff invitation to the UNIFY Vendor Portal.", category: "STAFF INVITATION", heading: "You are invited", footer: vendorFooter, blocks: [
    { kind: "paragraph", text: `Hi ${input.name},` },
    { kind: "paragraph", text: `${input.vendorName} has invited you to join its team in the UNIFY Vendor Portal.` },
    { kind: "notice", text: `This invitation expires at ${emailDate(input.expiresAt)}.` },
    { kind: "action", label: "Accept staff invitation", url: input.inviteUrl },
  ] });
}

type VendorApplication = { contactName: string; companyName: string };
export function renderVendorApplicationSubmittedEmail(input: VendorApplication) {
  return renderEmail({ subject: "We received your UNIFY application", preview: "Your application has been submitted and is awaiting review.", category: "APPLICATION UPDATE", heading: "Application received", footer: vendorFooter, blocks: [
    { kind: "paragraph", text: `Hi ${input.contactName},` },
    { kind: "paragraph", text: `We have received ${input.companyName}'s application to become a UNIFY credential verifier.` },
    { kind: "notice", label: "Awaiting review", text: "Our team will review your application and email you when a decision has been made." },
  ] });
}
export function renderVendorApplicationApprovedEmail(input: VendorApplication & { portalUrl: string }) {
  return renderEmail({ subject: "Your UNIFY verifier application has been approved", preview: "Your verifier application is approved. Open the Vendor Portal to continue.", category: "APPLICATION UPDATE", heading: "Your application is approved", footer: vendorFooter, blocks: [
    { kind: "paragraph", text: `Hi ${input.contactName},` },
    { kind: "paragraph", text: `${input.companyName} is now approved as a UNIFY credential verifier.` },
    { kind: "action", label: "Open Vendor Portal", url: input.portalUrl },
  ] });
}
export function renderVendorApplicationRejectedEmail(input: VendorApplication & { reason: string; applicationUrl: string }) {
  return renderEmail({ subject: "An update on your UNIFY verifier application", preview: "Review the feedback on your application and the next steps.", category: "APPLICATION UPDATE", heading: "Your application was not approved", footer: vendorFooter, blocks: [
    { kind: "paragraph", text: `Hi ${input.contactName},` },
    { kind: "paragraph", text: `${input.companyName}'s application was not approved at this time.` },
    { kind: "notice", tone: "attention", label: "Reason", text: input.reason },
    { kind: "paragraph", text: "Address the feedback and submit a new application when you are ready." },
    { kind: "action", label: "View application", url: input.applicationUrl },
  ] });
}
export function renderVendorApplicationRevokedEmail(input: VendorApplication & { reason: string }) {
  return renderEmail({ subject: "Your UNIFY verifier access has been revoked", preview: "Your verifier access has changed. Review the reason in this email.", category: "ACCESS UPDATE", heading: "Verifier access revoked", footer: vendorFooter, blocks: [
    { kind: "paragraph", text: `Hi ${input.contactName},` },
    { kind: "paragraph", text: `${input.companyName}'s verifier access to UNIFY has been revoked.` },
    { kind: "notice", tone: "attention", label: "Reason", text: input.reason },
    { kind: "paragraph", text: "If you believe this is a mistake, contact the UNIFY team." },
  ] });
}

export type VendorHelpEmailContent = {
  title: string; details: string; submittedAt?: Date;
  submittedBy: { name: string; email: string };
  vendor: { companyName?: string | null; contactEmail?: string | null; contactPersonName?: string | null; role?: string | null; serviceCategory?: string | null };
};
export function renderVendorHelpRequestEmail(input: VendorHelpEmailContent) {
  const value = (text: string | null | undefined) => text?.trim() || "Unknown";
  return renderEmail({ subject: `[UNIFY Vendor Help] ${input.title}`, preview: "A vendor submitted a help request from the UNIFY Vendor Portal.", category: "VENDOR SUPPORT", heading: "New vendor help request", footer: "UNIFY Vendor Portal · Internal support notification", blocks: [
    { kind: "paragraph", text: "A vendor submitted a help request from the UNIFY Vendor Portal." },
    { kind: "notice", label: input.title, text: input.details },
    { kind: "metadata", entries: [
      { label: "Submitted at", value: emailDate(input.submittedAt ?? new Date()) },
      { label: "Submitted by", value: `${input.submittedBy.name} <${input.submittedBy.email}>` },
      { label: "Vendor", value: value(input.vendor.companyName) },
      { label: "Portal role", value: value(input.vendor.role) },
      { label: "Contact person", value: value(input.vendor.contactPersonName) },
      { label: "Vendor contact email", value: value(input.vendor.contactEmail) },
      { label: "Service category", value: value(input.vendor.serviceCategory) },
    ] },
  ] });
}
