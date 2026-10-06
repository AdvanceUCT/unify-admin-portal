import { describe, expect, it } from "vitest";
import { emailDate, renderEmail } from "@/lib/email/layout";
import * as templates from "@/lib/email/templates";

const expiresAt = new Date("2026-10-02T06:00:00.000Z");
const url = "https://voskuils.com/activate?token=test-only&a=one%20two&next=%2Fwallet";
const base = { name: "Alex <Admin>", contactName: "Alex <Owner>", companyName: "Campus & Coffee", vendorName: "Campus & Coffee" };
const messages = [
  templates.renderPaymentOtpEmail({ studentName: base.name, otp: "617204" }),
  templates.renderCredentialActivationEmail({ studentName: base.name, activationUrl: url, expiresAt: expiresAt.toISOString() }),
  templates.renderAdminInviteEmail({ ...base, inviteUrl: url, expiresAt }),
  templates.renderPasswordResetEmail({ ...base, resetUrl: url, expiresInMinutes: 60 }),
  templates.renderVendorStaffInviteEmail({ ...base, inviteUrl: url, expiresAt }),
  templates.renderVendorApplicationSubmittedEmail(base),
  templates.renderVendorApplicationApprovedEmail({ ...base, portalUrl: url }),
  templates.renderVendorApplicationRejectedEmail({ ...base, applicationUrl: url, reason: "Update <details> & documents.\nThen resubmit." }),
  templates.renderVendorApplicationRevokedEmail({ ...base, reason: "Approval conditions <changed>." }),
  templates.renderVendorHelpRequestEmail({ title: "Access <problem>", details: "First line\nSecond line & notes", submittedAt: expiresAt, submittedBy: { name: base.name, email: "alex@example.invalid" }, vendor: { companyName: base.companyName } }),
  templates.renderVendorOverdraftStartedEmail({ ...base, deficit: "R 20.00", suspendAt: expiresAt, topUpUrl: url }),
  templates.renderVendorPaymentsSuspendedEmail({ ...base, deficit: "R 20.00", days: 14, topUpUrl: url }),
  templates.renderVendorPaymentsRestoredEmail(base),
];

describe("Wallet Signature email templates", () => {
  it.each(messages.map((message, index) => [index, message] as const))("renders template %i with a safe shared layout and useful plain text", (_index, message) => {
    expect(message.html).toContain('role="presentation"');
    expect(message.html).toContain('max-width:560px');
    expect(message.html).toContain('bgcolor="#123B31"');
    const document = new DOMParser().parseFromString(message.html, "text/html");
    expect(document.querySelector("script, img, admin, owner, problem, details, changed")).toBeNull();
    expect(message.text).toContain("UNIFY");
    const preview = message.html.match(/mso-hide:all;">([^<]*)<\/div>/)![1];
    expect(preview.length).toBeLessThan(90);
    expect(preview).not.toMatch(/617204|test-only/);
    expect(message.subject).not.toMatch(/617204|test-only/);
  });
  it.each([
    '<SCRIPT>alert("example")</SCRIPT>',
    '<ScRiPt>alert("example")</script foo="bar">',
    '<IMG SRC=x onerror="alert(1)">',
  ])("renders tag-like input as literal text: %s", (input) => {
    const rendered = renderEmail({ subject: "Sample", category: "TEST", heading: "Sample", preview: "A fictional sample", footer: "Test only", blocks: [{ kind: "paragraph", text: input }] });
    const document = new DOMParser().parseFromString(rendered.html, "text/html");
    expect(document.querySelector("script, img, [onerror]")).toBeNull();
    expect(document.body.textContent).toContain(input);
    expect(rendered.text).toContain(input);
  });
  it("keeps activation tokens and query parameters intact in the button, fallback and plain text", () => {
    const rendered = messages[1];
    const hrefs = [...rendered.html.matchAll(/href="([^"]+)"/g)].map(match => match[1].replaceAll("&amp;", "&"));
    expect(hrefs).toEqual([url, url]); expect(rendered.text).toContain(url);
    expect(rendered.html).toContain("Open Student Wallet");
  });
  it("shows one selectable OTP with the actual expiry and no action link", () => {
    expect(messages[0].html.match(/617204/g)).toHaveLength(1);
    expect(messages[0].text).toContain("617204\nIt expires in 10 minutes.");
    expect(messages[0].html).not.toContain('href="');
  });
  it("uses South African expiry dates consistently in HTML and plain text", () => {
    expect(emailDate(expiresAt)).toContain("2 October 2026"); expect(emailDate(expiresAt)).toContain("08:00 SAST");
    for (const index of [1, 2, 4]) { expect(messages[index].html).toContain(emailDate(expiresAt)); expect(messages[index].text).toContain(emailDate(expiresAt)); }
    expect(messages[3].text).toContain("expires in 60 minutes");
  });
  it("escapes support content, preserves line breaks and includes all optional metadata labels", () => {
    const help = messages[9];
    expect(help.html).toContain("Access &lt;problem&gt;"); expect(help.html).toContain("First line<br />Second line &amp; notes");
    expect(help.text).toContain("First line\nSecond line & notes");
    for (const label of ["Submitted at", "Submitted by", "Vendor", "Portal role", "Contact person", "Vendor contact email", "Service category"]) { expect(help.html).toContain(label); expect(help.text).toContain(label); }
    expect(help.text).toContain("Unknown");
  });
  it("does not imply payment approval or add actions to informational notices", () => {
    expect(messages[6].text).toContain("credential verifier"); expect(messages[6].text).not.toMatch(/approved.*payment/i);
    for (const index of [5, 8, 9]) expect(messages[index].html).not.toContain('href="');
    expect(messages[7].text).toContain("not approved"); expect(messages[8].text).toContain("revoked");
  });
  it("handles long names, URLs and support details without dropping their content", () => {
    const longUrl = url + "&context=" + "a".repeat(500);
    const longName = "Student ".repeat(40);
    const rendered = templates.renderCredentialActivationEmail({ studentName: longName, activationUrl: longUrl, expiresAt: expiresAt.toISOString() });
    expect(rendered.text).toContain(longName); expect(rendered.text).toContain(longUrl); expect(rendered.html).toContain("word-break:break-all");
  });
  it("escapes quotes in URL attributes and provides equivalent action copy in plain text", () => {
    const rendered = renderEmail({ subject: "Sample", category: "TEST", heading: "Sample", preview: "A fictional sample", footer: "Test only", blocks: [{ kind: "action", label: "Open", url: 'https://example.invalid/?value="quoted"&x=1' }] });
    expect(rendered.html).toContain('href="https://example.invalid/?value=&quot;quoted&quot;&amp;x=1"');
    expect(rendered.text).toContain('Open: https://example.invalid/?value="quoted"&x=1');
  });
});
