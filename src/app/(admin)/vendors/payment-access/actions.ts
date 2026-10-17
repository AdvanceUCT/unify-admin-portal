"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth/session";
import { assertCan } from "@/lib/auth/permissions";
import type { AccessActionResult } from "@/lib/payments/paymentAccessSummary";

async function review(formData: FormData, approve: boolean): Promise<AccessActionResult> {
  const session = await requireRole(["SUPER_ADMIN", "ADMIN"]);
  assertCan("vendor:write", session);
  const applicationId = String(formData.get("applicationId") ?? "");
  try {
    const service = await import("@/lib/payments/branchOnboarding");
    if (approve) await service.approveBranchPaymentApplication({ applicationId, reviewerId: session.user.id, expectedPayoutReference: String(formData.get("payoutReference") ?? "") });
    else await service.rejectBranchPaymentApplication({ applicationId, reviewerId: session.user.id, notes: String(formData.get("notes") ?? "") });
    revalidatePath("/vendors", "layout"); revalidatePath("/vendor", "layout");
    return { ok: true, message: approve ? "Branch approved. Existing payment restrictions remain in effect." : "Request rejected. The vendor can review your feedback." };
  } catch (error) {
    if (error instanceof z.ZodError) return { error: error.issues[0]?.message ?? "Check the review details." };
    const message = error instanceof Error ? error.message : "";
    if (/^(This payment-access request|Only active branches|Vendor approval|Payment wallet functionality|The payout account changed|Save a payout destination|Unable to read the saved payout)/.test(message)) return { error: message };
    return { uncertain: true, error: "The decision could not be confirmed. Reload the current request before trying again." };
  }
}
export async function approvePaymentAccessAction(_state: AccessActionResult, formData: FormData) { return review(formData, true); }
export async function rejectPaymentAccessAction(_state: AccessActionResult, formData: FormData) { return review(formData, false); }
