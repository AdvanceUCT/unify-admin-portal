/**
 * @fileoverview Closes eligible billing periods and issues immutable vendor invoices.
 *
 * Deliberately not "server-only": `scripts/billing-invoices.ts` calls this
 * outside the Next.js server bundle, matching
 * `src/lib/payments/foundation.ts`'s precedent for CLI-callable modules.
 * @module lib/billing/invoices
 */

import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { VendorInvoicePaymentStatus } from "@/generated/prisma/enums";
import { INVOICE_CLOSING_DELAY_SECONDS, MAX_INVOICES_PER_VENDOR_PER_RUN, VENDOR_INVOICE_NUMBER_PREFIX } from "@/lib/billing/constants";
import { env } from "@/lib/config/env";
import { billingPeriodEndUtc, nextBillingPeriodKey } from "@/lib/vendors/verificationBilling";

export type ReadClient = Pick<Prisma.TransactionClient, "verificationCharge" | "vendorInvoice">;
export type InvoiceIssuanceClient = Pick<
  Prisma.TransactionClient,
  "verificationCharge" | "vendorInvoice" | "vendorInvoiceItem" | "vendorProfile" | "universityProfile" | "$queryRaw"
>;
export type InvoiceGenerationRunner = Pick<PrismaClient, "$transaction"> & ReadClient;
type TransactionRunner = Pick<PrismaClient, "$transaction">;

const MAX_SERIALIZABLE_ATTEMPTS = 3;

function hasPrismaErrorCode(error: unknown, code: string) {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

async function runSerializableTransaction<T>(
  db: TransactionRunner,
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
) {
  for (let attempt = 0; attempt < MAX_SERIALIZABLE_ATTEMPTS; attempt += 1) {
    try {
      return await db.$transaction(operation, { isolationLevel: "Serializable" });
    } catch (error) {
      if (!hasPrismaErrorCode(error, "P2034") || attempt === MAX_SERIALIZABLE_ATTEMPTS - 1) {
        throw error;
      }
    }
  }

  throw new Error("The invoice issuance transaction could not be completed.");
}

export function isBillingPeriodClosed(periodKey: string, now: Date, closingDelaySeconds = INVOICE_CLOSING_DELAY_SECONDS) {
  const closesAt = new Date(billingPeriodEndUtc(periodKey).getTime() + closingDelaySeconds * 1000);
  return now >= closesAt;
}

/**
 * Determines the one period a vendor's *next* regular invoice should cover,
 * or null if there is nothing to do yet. Always picks the later of "the
 * period right after the vendor's last invoice" and "the vendor's earliest
 * still-unclaimed charge" — this skips cleanly over any gap with zero
 * activity (never generates an empty invoice) while still sweeping in any
 * late-arriving charges from an already-invoiced period into whichever
 * period comes next.
 */
export async function resolveNextInvoicePeriodForVendor(
  client: ReadClient,
  vendorProfileId: string,
  currency: string,
  now: Date,
): Promise<string | null> {
  const [lastInvoice, earliestUnclaimed] = await Promise.all([
    client.vendorInvoice.findFirst({
      where: { vendorProfileId, currency },
      orderBy: { periodKey: "desc" },
      select: { periodKey: true },
    }),
    client.verificationCharge.findFirst({
      where: { vendorProfileId, currency, invoiceItem: null },
      orderBy: { servicePeriodKey: "asc" },
      select: { servicePeriodKey: true },
    }),
  ]);

  if (!earliestUnclaimed) return null;

  const afterLastInvoice = lastInvoice ? nextBillingPeriodKey(lastInvoice.periodKey) : null;
  const candidate =
    afterLastInvoice && afterLastInvoice > earliestUnclaimed.servicePeriodKey
      ? afterLastInvoice
      : earliestUnclaimed.servicePeriodKey;

  return isBillingPeriodClosed(candidate, now) ? candidate : null;
}

export type IssuedInvoicePreview = {
  vendorProfileId: string;
  periodKey: string;
  currency: string;
  chargeCount: number;
  totalMinor: bigint;
  platformShareMinor: bigint;
  universityShareMinor: bigint;
};

/**
 * Read-only: reports what `runVendorInvoiceGeneration` would issue, without
 * writing anything. Since nothing is written, the per-vendor loop is
 * simulated locally (a local "simulated last invoice period" and a cursor
 * over already-loaded unclaimed charges) rather than re-querying between
 * iterations — re-querying would see the same unclaimed charges forever and
 * never advance.
 */
export async function previewVendorInvoiceGeneration(
  client: ReadClient,
  options: { now?: Date; currency?: string } = {},
): Promise<IssuedInvoicePreview[]> {
  const now = options.now ?? new Date();
  const currency = options.currency ?? "ZAR";
  const zero = BigInt(0);

  const candidateRows = await client.verificationCharge.findMany({
    where: { invoiceItem: null, currency },
    distinct: ["vendorProfileId"],
    select: { vendorProfileId: true },
  });

  const previews: IssuedInvoicePreview[] = [];

  for (const { vendorProfileId } of candidateRows) {
    const lastInvoice = await client.vendorInvoice.findFirst({
      where: { vendorProfileId, currency },
      orderBy: { periodKey: "desc" },
      select: { periodKey: true },
    });
    const unclaimedCharges = await client.verificationCharge.findMany({
      where: { vendorProfileId, currency, invoiceItem: null },
      orderBy: { servicePeriodKey: "asc" },
      select: { servicePeriodKey: true, feeMinor: true, platformShareMinor: true, universityShareMinor: true },
    });

    let simulatedLastPeriod = lastInvoice?.periodKey ?? null;
    let cursor = 0;

    for (
      let iteration = 0;
      iteration < MAX_INVOICES_PER_VENDOR_PER_RUN && cursor < unclaimedCharges.length;
      iteration += 1
    ) {
      const afterLastInvoice = simulatedLastPeriod ? nextBillingPeriodKey(simulatedLastPeriod) : null;
      const earliestRemaining = unclaimedCharges[cursor].servicePeriodKey;
      const periodKey =
        afterLastInvoice && afterLastInvoice > earliestRemaining ? afterLastInvoice : earliestRemaining;

      if (!isBillingPeriodClosed(periodKey, now)) break;

      const claimed: typeof unclaimedCharges = [];
      while (cursor < unclaimedCharges.length && unclaimedCharges[cursor].servicePeriodKey <= periodKey) {
        claimed.push(unclaimedCharges[cursor]);
        cursor += 1;
      }
      if (claimed.length === 0) break;

      previews.push({
        vendorProfileId,
        periodKey,
        currency,
        chargeCount: claimed.length,
        totalMinor: claimed.reduce((sum, c) => sum + c.feeMinor, zero),
        platformShareMinor: claimed.reduce((sum, c) => sum + c.platformShareMinor, zero),
        universityShareMinor: claimed.reduce((sum, c) => sum + c.universityShareMinor, zero),
      });

      simulatedLastPeriod = periodKey;
    }
  }

  return previews;
}

async function nextVendorInvoiceNumber(client: Pick<InvoiceIssuanceClient, "$queryRaw">, now: Date) {
  const rows = await client.$queryRaw<Array<{ nextval: bigint }>>`SELECT nextval('vendor_invoice_number_seq') AS nextval`;
  const sequenceValue = rows[0].nextval.toString().padStart(6, "0");
  return `${VENDOR_INVOICE_NUMBER_PREFIX}-${now.getUTCFullYear()}-${sequenceValue}`;
}

/**
 * Issues exactly one invoice for one vendor/period/currency in a single
 * short transaction: claims every still-unclaimed eligible charge with
 * `servicePeriodKey <= periodKey` (this period's own usage plus any
 * late-arriving prior-period stragglers), snapshots issuer/customer
 * contents, assigns a database-sequenced number, and flips the invoice from
 * DRAFT to ISSUED. Returns null (writing nothing) if there is truly no
 * eligible usage — an empty invoice is never created. The
 * `(vendorProfileId, periodKey, currency)` unique constraint is the final
 * concurrency guard if two callers somehow race for the same target.
 */
export async function issueInvoiceForVendorPeriod(
  db: TransactionRunner,
  params: { vendorProfileId: string; periodKey: string; currency?: string; now?: Date },
) {
  const currency = params.currency ?? "ZAR";
  const now = params.now ?? new Date();

  try {
    return await runSerializableTransaction(db, async (tx) => {
      const charges = await tx.verificationCharge.findMany({
        where: {
          vendorProfileId: params.vendorProfileId,
          currency,
          invoiceItem: null,
          servicePeriodKey: { lte: params.periodKey },
        },
        orderBy: [{ servicePeriodKey: "asc" }, { serviceCompletedAt: "asc" }],
      });

      if (charges.length === 0) return null;

      const zero = BigInt(0);
      const totalMinor = charges.reduce((sum, c) => sum + c.feeMinor, zero);
      const platformShareMinor = charges.reduce((sum, c) => sum + c.platformShareMinor, zero);
      const universityShareMinor = charges.reduce((sum, c) => sum + c.universityShareMinor, zero);

      const vendor = await tx.vendorProfile.findUniqueOrThrow({
        where: { id: params.vendorProfileId },
        select: { companyName: true, contactEmail: true },
      });
      const university = await tx.universityProfile.findFirstOrThrow({
        select: { name: true, abbreviation: true, contactEmail: true },
      });
      const invoiceNumber = await nextVendorInvoiceNumber(tx, now);

      const draftInvoice = await tx.vendorInvoice.create({
        data: {
          invoiceNumber,
          vendorProfileId: params.vendorProfileId,
          periodKey: params.periodKey,
          currency,
          issuerSnapshot: {
            name: university.name,
            abbreviation: university.abbreviation,
            contactEmail: university.contactEmail,
          },
          customerSnapshot: {
            companyName: vendor.companyName,
            contactEmail: vendor.contactEmail,
          },
          totalMinor,
          platformShareMinor,
          universityShareMinor,
          isDemo: true,
          updatedAt: now,
        },
      });

      await tx.vendorInvoiceItem.createMany({
        data: charges.map((charge) => ({
          invoiceId: draftInvoice.id,
          chargeId: charge.id,
          servicePeriodKey: charge.servicePeriodKey,
          branchNameSnapshot: charge.branchNameSnapshot,
          quantity: 1,
          unitPriceMinor: charge.feeMinor,
          lineTotalMinor: charge.feeMinor,
          platformShareMinor: charge.platformShareMinor,
          universityShareMinor: charge.universityShareMinor,
        })),
      });

      return tx.vendorInvoice.update({
        where: { id: draftInvoice.id },
        data: {
          documentStatus: "ISSUED",
          issuedAt: now,
          paymentStatus: totalMinor === zero ? VendorInvoicePaymentStatus.NO_PAYMENT_REQUIRED : VendorInvoicePaymentStatus.UNPAID,
        },
      });
    });
  } catch (error) {
    if (hasPrismaErrorCode(error, "P2002")) {
      // Another concurrent generation run already issued this exact
      // (vendor, period, currency) invoice first; nothing more to do.
      return null;
    }
    throw error;
  }
}

export type VendorInvoiceGenerationSummary = {
  vendorsScanned: number;
  invoicesIssued: number;
  zeroTotalInvoices: number;
  /** True when this run did nothing because VERIFICATION_INVOICING_ENABLED is off — distinct from "nothing was due". */
  skippedDisabled: boolean;
};

const DISABLED_SUMMARY: VendorInvoiceGenerationSummary = {
  vendorsScanned: 0,
  invoicesIssued: 0,
  zeroTotalInvoices: 0,
  skippedDisabled: true,
};

/**
 * Issues every currently-due invoice: for each vendor with unclaimed
 * charges, repeatedly issues the next eligible period's invoice until no
 * closed period remains to bill (bounded per vendor for safety). The same
 * service backs the CLI job, the admin "Generate missing invoices" action,
 * and the daily cron.
 *
 * `VERIFICATION_INVOICING_ENABLED` stops *new* issuance only — per the
 * handoff, invoice reading, signed webhook receipt, and reconciliation of
 * already-issued invoices must keep working regardless, so this flag is
 * deliberately not checked anywhere else.
 */
export async function runVendorInvoiceGeneration(
  db: TransactionRunner & ReadClient,
  options: { now?: Date; currency?: string } = {},
): Promise<VendorInvoiceGenerationSummary> {
  if (!env.VERIFICATION_INVOICING_ENABLED) return DISABLED_SUMMARY;

  const now = options.now ?? new Date();
  const currency = options.currency ?? "ZAR";

  const candidateRows = await db.verificationCharge.findMany({
    where: { invoiceItem: null, currency },
    distinct: ["vendorProfileId"],
    select: { vendorProfileId: true },
  });

  const summary: VendorInvoiceGenerationSummary = {
    vendorsScanned: candidateRows.length,
    invoicesIssued: 0,
    zeroTotalInvoices: 0,
    skippedDisabled: false,
  };

  for (const { vendorProfileId } of candidateRows) {
    const forVendor = await issueDueInvoicesForVendor(db, vendorProfileId, currency, now);
    summary.invoicesIssued += forVendor.invoicesIssued;
    summary.zeroTotalInvoices += forVendor.zeroTotalInvoices;
  }

  return summary;
}

async function issueDueInvoicesForVendor(db: TransactionRunner & ReadClient, vendorProfileId: string, currency: string, now: Date) {
  let invoicesIssued = 0;
  let zeroTotalInvoices = 0;

  for (let iteration = 0; iteration < MAX_INVOICES_PER_VENDOR_PER_RUN; iteration += 1) {
    const periodKey = await resolveNextInvoicePeriodForVendor(db, vendorProfileId, currency, now);
    if (!periodKey) break;

    const invoice = await issueInvoiceForVendorPeriod(db, { vendorProfileId, periodKey, currency, now });
    if (!invoice) break;

    invoicesIssued += 1;
    if (invoice.totalMinor === BigInt(0)) zeroTotalInvoices += 1;
  }

  return { invoicesIssued, zeroTotalInvoices };
}

/**
 * Issues every currently-due invoice for exactly one vendor — the same
 * bounded per-vendor loop `runVendorInvoiceGeneration` uses, without the
 * outer scan across every vendor with unclaimed charges. Used by the vendor
 * self-service test tool so a vendor can only ever generate their own
 * invoices, never anyone else's. Also respects
 * `VERIFICATION_INVOICING_ENABLED`, for the same reason the global version does.
 */
export async function runVendorInvoiceGenerationForVendor(
  db: TransactionRunner & ReadClient,
  vendorProfileId: string,
  options: { now?: Date; currency?: string } = {},
): Promise<VendorInvoiceGenerationSummary> {
  if (!env.VERIFICATION_INVOICING_ENABLED) return DISABLED_SUMMARY;

  const now = options.now ?? new Date();
  const currency = options.currency ?? "ZAR";

  const { invoicesIssued, zeroTotalInvoices } = await issueDueInvoicesForVendor(db, vendorProfileId, currency, now);

  return { vendorsScanned: 1, invoicesIssued, zeroTotalInvoices, skippedDisabled: false };
}
