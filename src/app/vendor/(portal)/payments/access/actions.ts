"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireVendorOwnerContext } from "@/lib/vendors/context";
import type { AccessActionResult } from "@/lib/payments/paymentAccessSummary";

function refresh(branchId?: string) {
  for (const path of ["/vendor/payments", "/vendor/payments/access", "/vendor/payments/payouts", "/vendor/applications", "/vendor/integrations", "/vendor/branches", "/vendors"]) revalidatePath(path);
  if (branchId) { revalidatePath(`/vendor/branches/${branchId}`); revalidatePath(`/vendor/branches/${branchId}/payment-access`); }
}
export async function getPayoutBanksAction() {
  await requireVendorOwnerContext();
  try { const { payoutBanks } = await import("@/lib/payments/banks"); return { banks: await payoutBanks() }; }
  catch { return { error: "Banks could not be loaded. Try again." }; }
}
export async function savePaymentAccessPayoutAction(_state: AccessActionResult, formData: FormData): Promise<AccessActionResult> {
  const { session, context } = await requireVendorOwnerContext();
  const raw = (key: string) => String(formData.get(key) ?? "").trim();
  const fieldErrors: Record<string, string> = {};
  if (!raw("accountHolderName")) fieldErrors.accountHolderName = "Enter the account holder name.";
  if (!/^\d{6,20}$/.test(raw("accountNumber").replace(/\s+/g, ""))) fieldErrors.accountNumber = "Enter an account number with 6 to 20 digits.";
  if (!raw("bankCode")) fieldErrors.bankCode = "Choose a bank.";
  if (Object.keys(fieldErrors).length) return { fieldErrors, error: "Check the account details below." };
  try {
    const { payoutBanks } = await import("@/lib/payments/banks");
    const bank = (await payoutBanks()).find(bank => bank.code === raw("bankCode"));
    if (!bank) return { fieldErrors: { bankCode: "Choose an available bank." }, error: "The selected bank is unavailable." };
    const { saveVendorPayoutDestination } = await import("@/lib/vendors/payouts");
    await saveVendorPayoutDestination(context, session.user.id, { accountHolderName: raw("accountHolderName"), accountNumber: raw("accountNumber"), bankCode: bank.code, bankName: bank.name });
    const { getVendorPayoutDestinationSummary } = await import("@/lib/payments/branchOnboarding");
    const { safePayoutAccount } = await import("@/lib/payments/paymentAccess");
    const saved = await getVendorPayoutDestinationSummary(context.vendorProfileId);
    const account = saved ? safePayoutAccount(saved.snapshot, saved.reference, saved.provider) : null;
    if (!account) return { uncertain: true, error: "Check the saved account before trying again. Reload this page." };
    refresh();
    return { ok: true, account, message: "Payout account saved." };
  } catch {
    return { uncertain: true, error: "We could not confirm the save. Reload to check the saved account before trying again." };
  }
}
export async function submitPaymentAccessAction(_state: AccessActionResult, formData: FormData): Promise<AccessActionResult> {
  const { session, context } = await requireVendorOwnerContext();
  const branchId = String(formData.get("branchId") ?? "");
  try {
    const { submitBranchPaymentApplication } = await import("@/lib/payments/branchOnboarding");
    const application = await submitBranchPaymentApplication({ vendorProfileId: context.vendorProfileId, branchId, actorId: session.user.id,
      acknowledgementAccepted: formData.get("acknowledgement") === "on", expectedPayoutReference: String(formData.get("payoutReference") ?? ""),
      reconfirmApplicationId: String(formData.get("reconfirmApplicationId") ?? "") || undefined });
    refresh(branchId);
    return { ok: true, applicationId: application.id, message: "Request saved. It is awaiting university review." };
  } catch (error) {
    if (error instanceof z.ZodError) return { error: error.issues[0]?.message ?? "Check the request details." };
    const message = error instanceof Error ? error.message : "";
    if (/^(Branch was not found|Only active branches|Vendor approval|This branch is already|The payout account changed|This request has already|Review and confirm|Save a payout destination|Unable to read the saved payout)/.test(message)) return { error: message };
    return { uncertain: true, error: "We could not confirm submission. Reload to check the request before trying again." };
  }
}
