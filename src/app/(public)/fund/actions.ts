/**
 * @fileoverview Server action that starts a public external-funder top-up and redirects to Paystack.
 * @module app/(public)/fund/actions
 */

"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { randToMinor } from "@/lib/formatters";
import { WalletDomainError } from "@/lib/payments/errors";
import { createFunderTopup } from "@/lib/payments/topups";

import { type FundErrorKey, fundErrorKeyFor } from "./fundErrors";

function readString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "");
}

function formErrorPath(key: FundErrorKey) {
  return `/fund?fundError=${key}`;
}

/** First `x-forwarded-for` hop, as the activation route reads it; trustworthy only behind a proxy that overwrites the header. */
async function clientIp() {
  const forwardedFor = (await headers()).get("x-forwarded-for");
  return forwardedFor?.split(",")[0]?.trim() || null;
}

export async function startFunderTopupAction(formData: FormData) {
  const amountMinor = randToMinor(readString(formData, "amount"));
  if (Number.isNaN(amountMinor)) redirect(formErrorPath("amount"));

  let destination: string;
  try {
    const topUp = await createFunderTopup({
      studentNumber: readString(formData, "studentNumber"),
      studentSurname: readString(formData, "studentSurname"),
      funderName: readString(formData, "funderName"),
      funderEmail: readString(formData, "funderEmail"),
      amountMinor,
      currency: "ZAR",
      idempotencyKey: readString(formData, "idempotencyKey"),
      ipAddress: await clientIp(),
    });
    destination = topUp.status === "PENDING" && topUp.authorizationUrl
      ? topUp.authorizationUrl
      : `/fund/return?topUpId=${encodeURIComponent(topUp.topUpId)}&reference=${encodeURIComponent(topUp.reference)}`;
  } catch (error) {
    if (!(error instanceof WalletDomainError)) {
      // Name and code only: provider/database messages may echo submitted details.
      const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "none";
      console.error(`[funder-topup] failed to start checkout: ${error instanceof Error ? error.name : typeof error} (code ${code})`);
    }
    redirect(formErrorPath(fundErrorKeyFor(error)));
  }
  redirect(destination);
}
