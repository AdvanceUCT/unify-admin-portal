/**
 * @fileoverview Server actions for vendor wallet-payment payout settings.
 * @module app/vendor/(portal)/payments/actions
 */

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { PaystackProviderError } from "@/lib/paymentProviders/paystack/errors";
import { requireVendorOwnerContext } from "@/lib/vendors/context";
import { runVendorWalletPayoutForVendor, saveVendorPayoutDestination } from "@/lib/vendors/payouts";

export type RunOwnPayoutResult = {
  status: "completed" | "processing" | "failed" | "requires_reconciliation" | "skipped";
  amountMinor: number;
  currency: string;
  message: string;
  reference?: string;
  failureCode?: string;
  providerMessage?: string;
};

function readString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "");
}

function safeVendorReturnPath(value: string) {
  return value.startsWith("/vendor/") ? value : "/vendor/payments";
}

export async function savePayoutDestinationAction(formData: FormData) {
  const { session, context } = await requireVendorOwnerContext();
  const returnTo = safeVendorReturnPath(readString(formData, "returnTo"));
  try {
    await saveVendorPayoutDestination(context, session.user.id, {
      accountHolderName: readString(formData, "accountHolderName"),
      accountNumber: readString(formData, "accountNumber"),
      bankCode: readString(formData, "bankCode"),
      bankName: readString(formData, "bankName"),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save payout details.";
    redirect(`${returnTo}?payoutError=${encodeURIComponent(message)}`);
  }

  revalidatePath(returnTo);
  revalidatePath("/vendor/payments");
  revalidatePath("/vendor/payments/payouts");
  redirect(`${returnTo}?payout=updated`);
}

export async function runOwnPayoutAction(): Promise<RunOwnPayoutResult> {
  const { session, context } = await requireVendorOwnerContext();

  try {
    const summary = await runVendorWalletPayoutForVendor({
      vendorProfileId: context.vendorProfileId,
      initiatedByUserId: session.user.id,
      simulateProviderTransfer: true,
    });
    revalidatePath("/vendor/payments");
    revalidatePath("/vendor/payments/payouts");

    const batch = summary.batches.find((item) => item.vendorProfileId === context.vendorProfileId);
    if (!batch) {
      return {
        status: "skipped",
        amountMinor: 0,
        currency: "ZAR",
        message: summary.vendorsScanned === 0
          ? "No approved payout destination is ready for this vendor yet."
          : "No eligible payout balance is available right now.",
      };
    }

    if (batch.status === "completed") {
      return {
        status: "completed",
        amountMinor: batch.amountMinor,
        currency: batch.currency,
        reference: batch.reference,
        message: "Payout completed and the vendor wallet ledger was updated.",
      };
    }

    if (batch.status === "processing") {
      return {
        status: "processing",
        amountMinor: batch.amountMinor,
        currency: batch.currency,
        reference: batch.reference,
        message: "Payout was submitted to Paystack and is still processing.",
      };
    }

    if (batch.status === "requires_reconciliation") {
      return {
        status: "requires_reconciliation",
        amountMinor: batch.amountMinor,
        currency: batch.currency,
        reference: batch.reference,
        failureCode: batch.failureCode,
        providerMessage: batch.failureMessage,
        message: batch.failureMessage ?? "Paystack did not return a final outcome. The payout was reserved for reconciliation.",
      };
    }

    return {
      status: "failed",
      amountMinor: batch.amountMinor,
      currency: batch.currency,
      reference: batch.reference,
      failureCode: batch.failureCode,
      providerMessage: batch.failureMessage,
      message: batch.failureMessage ?? "Payout failed. Check the payout destination and Paystack test setup before trying again.",
    };
  } catch (error) {
    revalidatePath("/vendor/payments");
    const providerMessage = error instanceof PaystackProviderError ? error.message : undefined;
    return {
      status: "failed",
      amountMinor: 0,
      currency: "ZAR",
      providerMessage,
      message: providerMessage ?? "Unable to run payout. Check the payout destination and Paystack test setup before trying again.",
    };
  }
}
