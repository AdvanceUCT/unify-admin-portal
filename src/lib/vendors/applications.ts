import "server-only";

import { z } from "zod";

import type { Prisma } from "@/generated/prisma/client";
import { AuditAction, VendorApplicationStatus } from "@/generated/prisma/enums";
import { writeAuditLog } from "@/lib/audit/audit";
import { env } from "@/lib/config/env";
import { prisma } from "@/lib/db/prisma";
import { sendVendorApplicationApprovedEmail } from "@/lib/email/vendor-application-approved";
import { sendVendorApplicationRejectedEmail } from "@/lib/email/vendor-application-rejected";
import { sendVendorApplicationRevokedEmail } from "@/lib/email/vendor-application-revoked";
import { sendVendorApplicationSubmittedEmail } from "@/lib/email/vendor-application-submitted";
import { ensureDefaultVendorBranch } from "@/lib/vendors/branches";
import { OTHER_VERIFICATION_REASON_VALUE, VERIFICATION_REASON_VALUES } from "@/lib/vendors/verification-reasons";

const DOCUMENT_FIELDS = [
  "docRegistrationCertificate",
  "docProofOfAddress",
  "docRepresentativeId",
  "docLetterOfAuthorisation",
  "docTaxCompliance",
  "docBusinessLicence",
] as const;
type DocumentField = (typeof DOCUMENT_FIELDS)[number];

function assertDocumentField(fieldKey: string): DocumentField {
  if (!(DOCUMENT_FIELDS as readonly string[]).includes(fieldKey)) {
    throw new Error(`Invalid document field: ${fieldKey}`);
  }

  return fieldKey as DocumentField;
}

const step1Schema = z.object({
  companyName: z.string().trim().min(1, "Company name is required").max(200, "Company name must be 200 characters or fewer"),
  companyRegistrationNumber: z
    .string()
    .trim()
    .regex(/^\d{4}\/\d{6}\/\d{2}$/, "Registration number must be in the format YYYY/NNNNNN/NN"),
  serviceCategory: z.string().trim().min(1, "Service category is required"),
  website: z
    .string()
    .trim()
    .url("Website must be a valid URL")
    .refine((value) => {
      try {
        return ["http:", "https:"].includes(new URL(value).protocol);
      } catch {
        return false;
      }
    }, "Website must start with http:// or https://")
    .optional()
    .or(z.literal("")),
  tradingName: z.string().trim().max(200, "Trading name must be 200 characters or fewer").optional(),
  organisationType: z.string().trim().min(1, "Organisation type is required"),
  physicalAddress: z
    .string()
    .trim()
    .min(1, "Physical address is required")
    .max(500, "Physical address must be 500 characters or fewer"),
  postalAddress: z.string().trim().max(500, "Postal address must be 500 characters or fewer").optional(),
});

const step2Schema = z.object({
  contactPersonName: z
    .string()
    .trim()
    .min(1, "Contact person name is required")
    .max(200, "Contact person name must be 200 characters or fewer"),
  contactEmail: z.string().trim().email("Contact email must be valid").max(254, "Contact email must be 254 characters or fewer"),
  contactJobTitle: z
    .string()
    .trim()
    .min(1, "Job title is required")
    .max(150, "Job title must be 150 characters or fewer"),
  contactPhone: z
    .string()
    .trim()
    .regex(/^0\d{9}$/, "Enter a valid South African cell number (10 digits, starting with 0)"),
  contactEmployeeNumber: z
    .string()
    .trim()
    .max(50, "Employee number must be 50 characters or fewer")
    .optional(),
  preferredContactMethod: z.enum(["email", "phone"]),
});

const step3Schema = z
  .object({
    verificationReasons: z
      .array(z.string().trim().min(1))
      .min(1, "Select at least one reason for requesting verification access")
      .refine(
        (values) => values.every((value) => VERIFICATION_REASON_VALUES.includes(value)),
        "Select a valid reason for requesting verification access",
      ),
    otherVerificationReason: z
      .string()
      .trim()
      .max(500, "Other reason must be 500 characters or fewer")
      .optional(),
    additionalInfo: z.string().trim().max(2000, "Additional information must be 2000 characters or fewer").optional(),
  })
  .refine(
    (data) =>
      !data.verificationReasons.includes(OTHER_VERIFICATION_REASON_VALUE) ||
      Boolean(data.otherVerificationReason),
    {
      message: "Please describe your other reason for requesting verification access",
      path: ["otherVerificationReason"],
    },
  );

const step5Schema = z.object({
  declarationAccepted: z.literal(true, {
    error: "You must accept the declaration to proceed",
  }),
});

const revokeApplicationSchema = z.object({
  applicationId: z.string().trim().min(1),
  reviewerId: z.string().trim().min(1),
  notes: z.string().trim().min(1, "A revocation reason is required").max(500),
});

function hasPrismaErrorCode(error: unknown, code: string) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}

async function runSerializableTransaction<T>(
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: "Serializable",
      });
    } catch (error) {
      if (!hasPrismaErrorCode(error, "P2034") || attempt === 2) {
        throw error;
      }
    }
  }

  throw new Error("The transaction could not be completed.");
}

function activeApplicationError(status?: VendorApplicationStatus) {
  return status === VendorApplicationStatus.APPROVED
    ? new Error("Your verifier application is already approved.")
    : new Error("You already have an application under review.");
}

export async function getVendorApplicationForUser(userId: string) {
  const vendorProfile = await prisma.vendorProfile.findUnique({
    where: { userId },
  });

  if (!vendorProfile) {
    return null;
  }

  return prisma.vendorApplication.findFirst({
    where: { vendorProfileId: vendorProfile.id },
    include: { vendorProfile: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function getVendorApplicationById(applicationId: string) {
  return prisma.vendorApplication.findUnique({
    where: { id: applicationId },
    include: {
      vendorProfile: {
        select: {
          companyName: true,
          serviceCategory: true,
          website: true,
          description: true,
          contactPersonName: true,
          contactEmail: true,
          verificationUrl: true,
        },
      },
    },
  });
}

export async function listVendorApplications({
  status,
}: {
  status?: VendorApplicationStatus | VendorApplicationStatus[];
} = {}) {
  const where = status
    ? Array.isArray(status)
      ? { status: { in: status } }
      : { status }
    : undefined;

  return prisma.vendorApplication.findMany({
    where,
    include: {
      vendorProfile: {
        select: {
          companyName: true,
          serviceCategory: true,
          contactEmail: true,
          contactPersonName: true,
          website: true,
          description: true,
          verificationUrl: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function listDecidedVendorApplications() {
  const applications = await prisma.vendorApplication.findMany({
    where: {
      status: {
        in: [
          VendorApplicationStatus.APPROVED,
          VendorApplicationStatus.REJECTED,
          VendorApplicationStatus.REVOKED,
        ],
      },
    },
    include: {
      vendorProfile: {
        select: { companyName: true, serviceCategory: true },
      },
    },
  });

  const actorIds = [
    ...new Set(
      applications
        .flatMap((application) => [
          application.reviewedByUserId,
          application.revokedByUserId,
        ])
        .filter(Boolean),
    ),
  ] as string[];

  const actors =
    actorIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, name: true },
        })
      : [];
  const actorMap = Object.fromEntries(actors.map((actor) => [actor.id, actor.name]));

  return applications
    .map((application) => {
      const isRevoked = application.status === VendorApplicationStatus.REVOKED;
      const decisionActorId = isRevoked
        ? application.revokedByUserId
        : application.reviewedByUserId;

      return {
        ...application,
        decisionActorName: decisionActorId
          ? (actorMap[decisionActorId] ?? null)
          : null,
        decisionAt: isRevoked ? application.revokedAt : application.reviewedAt,
        decisionNotes: isRevoked
          ? application.revokedNotes
          : application.reviewNotes,
        companyName:
          application.snapshotCompanyName ?? application.vendorProfile.companyName,
        serviceCategory:
          application.snapshotServiceCategory ?? application.vendorProfile.serviceCategory,
      };
    })
    .sort(
      (left, right) =>
        (right.decisionAt?.getTime() ?? 0) - (left.decisionAt?.getTime() ?? 0),
    );
}

/** Removes verifier privileges while leaving the vendor account available. */
export async function revokeVendorApplication(input: {
  applicationId: string;
  reviewerId: string;
  notes: string;
}) {
  const data = revokeApplicationSchema.parse(input);

  const application = await runSerializableTransaction(async (transaction) => {
    const existing = await transaction.vendorApplication.findUnique({
      where: { id: data.applicationId },
      include: { vendorProfile: true },
    });

    if (!existing || existing.status !== VendorApplicationStatus.APPROVED) {
      throw new Error("This vendor is not currently approved.");
    }

    const result = await transaction.vendorApplication.updateMany({
      where: {
        id: data.applicationId,
        status: VendorApplicationStatus.APPROVED,
      },
      data: {
        status: VendorApplicationStatus.REVOKED,
        revokedByUserId: data.reviewerId,
        revokedAt: new Date(),
        revokedNotes: data.notes,
      },
    });

    if (result.count !== 1) {
      throw new Error("This vendor is not currently approved.");
    }

    await writeAuditLog(
      {
        action: AuditAction.VENDOR_APPLICATION_REVOKED,
        actorId: data.reviewerId,
        targetType: "vendor_application",
        targetId: data.applicationId,
        meta: { notes: data.notes },
      },
      transaction,
    );

    return existing;
  });

  try {
    await sendVendorApplicationRevokedEmail({
      to: application.snapshotContactEmail ?? application.vendorProfile.contactEmail,
      contactName:
        application.snapshotContactPersonName ?? application.vendorProfile.contactPersonName ?? "",
      companyName: application.snapshotCompanyName ?? application.vendorProfile.companyName,
      reason: data.notes,
    });
  } catch (error) {
    console.error(
      `[vendor-application] Failed to send revocation email for ${data.applicationId}:`,
      error instanceof Error ? error.message : String(error),
    );
  }
}

/** Approves or rejects a pending application and records the decision atomically. */
export async function reviewVendorApplication({
  applicationId,
  decision,
  reviewerId,
  notes,
}: {
  applicationId: string;
  decision: "APPROVED" | "REJECTED";
  reviewerId: string;
  notes?: string;
}) {
  const normalizedNotes = notes?.trim();
  if (decision === VendorApplicationStatus.REJECTED && !normalizedNotes) {
    throw new Error("A rejection reason is required.");
  }

  let approvedVendor: { vendorProfileId: string; companyName: string } | undefined;
  let notifyContact: { to: string; contactName: string; companyName: string } | undefined;

  try {
    const result = await runSerializableTransaction(async (transaction) => {
      const application = await transaction.vendorApplication.findUnique({
        where: { id: applicationId },
        include: { vendorProfile: true },
      });

      if (!application || application.status !== VendorApplicationStatus.PENDING) {
        throw new Error("This application is not pending review.");
      }

      notifyContact = {
        to: application.snapshotContactEmail ?? application.vendorProfile.contactEmail,
        contactName:
          application.snapshotContactPersonName ?? application.vendorProfile.contactPersonName ?? "",
        companyName: application.snapshotCompanyName ?? application.vendorProfile.companyName,
      };

      const updateResult = await transaction.vendorApplication.updateMany({
        where: { id: applicationId, status: VendorApplicationStatus.PENDING },
        data: {
          status: decision,
          reviewedByUserId: reviewerId,
          reviewedAt: new Date(),
          reviewNotes: normalizedNotes || null,
        },
      });

      if (updateResult.count !== 1) {
        throw new Error("This application is not pending review.");
      }

      if (decision === VendorApplicationStatus.APPROVED) {
        const companyName =
          application.snapshotCompanyName ?? application.vendorProfile.companyName;

        await transaction.vendorProfile.update({
          where: { id: application.vendorProfileId },
          data: {
            companyName,
            serviceCategory:
              application.snapshotServiceCategory ?? application.vendorProfile.serviceCategory,
            contactEmail:
              application.snapshotContactEmail ?? application.vendorProfile.contactEmail,
            contactPersonName:
              application.snapshotContactPersonName ??
              application.vendorProfile.contactPersonName,
            website: application.snapshotWebsite,
          },
        });

        await transaction.vendorMembership.upsert({
          where: {
            vendorProfileId_userId: {
              vendorProfileId: application.vendorProfileId,
              userId: application.vendorProfile.userId,
            },
          },
          create: {
            vendorProfileId: application.vendorProfileId,
            userId: application.vendorProfile.userId,
            role: "OWNER",
          },
          update: { role: "OWNER", active: true },
        });

        approvedVendor = { vendorProfileId: application.vendorProfileId, companyName };
      }

      await writeAuditLog(
        {
          action:
            decision === VendorApplicationStatus.APPROVED
              ? AuditAction.VENDOR_APPLICATION_APPROVED
              : AuditAction.VENDOR_APPLICATION_REJECTED,
          actorId: reviewerId,
          targetType: "vendor_application",
          targetId: applicationId,
          meta: normalizedNotes ? { notes: normalizedNotes } : undefined,
        },
        transaction,
      );

      return transaction.vendorApplication.findUniqueOrThrow({
        where: { id: applicationId },
      });
    });

    if (approvedVendor) {
      try {
        await ensureVendorVerificationServicePoint(approvedVendor.vendorProfileId);
      } catch (error) {
        console.error(
          `[verification] Failed to create service point for vendor ${approvedVendor.vendorProfileId}:`,
          error instanceof Error ? error.message : String(error),
        );
      }
    }

    if (notifyContact) {
      try {
        if (decision === VendorApplicationStatus.APPROVED) {
          await sendVendorApplicationApprovedEmail({
            to: notifyContact.to,
            contactName: notifyContact.contactName,
            companyName: notifyContact.companyName,
            portalUrl: `${env.APP_URL}/vendor`,
          });
        } else {
          await sendVendorApplicationRejectedEmail({
            to: notifyContact.to,
            contactName: notifyContact.contactName,
            companyName: notifyContact.companyName,
            reason: normalizedNotes ?? "",
            applicationUrl: `${env.APP_URL}/vendor/application`,
          });
        }
      } catch (error) {
        console.error(
          `[vendor-application] Failed to send review decision email for ${applicationId}:`,
          error instanceof Error ? error.message : String(error),
        );
      }
    }

    return result;
  } catch (error) {
    if (hasPrismaErrorCode(error, "P2002")) {
      throw new Error("This vendor already has an active verifier application.");
    }

    throw error;
  }
}

export async function ensureVendorVerificationServicePoint(vendorProfileId: string) {
  const branch = await ensureDefaultVendorBranch(vendorProfileId);
  if (!branch.verificationUrl) throw new Error("Vendor verification service point is not configured.");
  return branch.verificationUrl;
}

export async function markApplicationViewed({
  applicationId,
}: {
  applicationId: string;
}) {
  await prisma.vendorApplication.updateMany({
    where: {
      id: applicationId,
      viewedByAdminAt: null,
    },
    data: {
      viewedByAdminAt: new Date(),
    },
  });
}

// ─── Draft Application Wizard ─────────────────────────────────────────────────

/** Finds the vendor's existing DRAFT or creates one; throws if PENDING/APPROVED exists. */
export async function getOrCreateDraftApplication(userId: string) {
  try {
    return await runSerializableTransaction(async (transaction) => {
      const vendorProfile = await transaction.vendorProfile.findUnique({
        where: { userId },
      });

      if (!vendorProfile) {
        throw new Error("No vendor profile found for this account.");
      }

      const existingActive = await transaction.vendorApplication.findFirst({
        where: {
          vendorProfileId: vendorProfile.id,
          status: { in: [VendorApplicationStatus.PENDING, VendorApplicationStatus.APPROVED] },
        },
        select: { status: true },
      });

      if (existingActive) {
        throw activeApplicationError(existingActive.status);
      }

      const existingDraft = await transaction.vendorApplication.findFirst({
        where: {
          vendorProfileId: vendorProfile.id,
          status: VendorApplicationStatus.DRAFT,
        },
      });

      if (existingDraft) {
        return existingDraft;
      }

      return transaction.vendorApplication.create({
        data: { vendorProfileId: vendorProfile.id, status: VendorApplicationStatus.DRAFT },
      });
    });
  } catch (error) {
    if (hasPrismaErrorCode(error, "P2002")) {
      throw activeApplicationError();
    }
    throw error;
  }
}

/** Saves step data to the draft. Step-specific validation is applied before writing. */
export async function saveDraftApplication(
  applicationId: string,
  userId: string,
  step: 1 | 2 | 3 | 5,
  rawData: Record<string, unknown>,
) {
  const application = await prisma.vendorApplication.findFirst({
    where: { id: applicationId, vendorProfile: { userId }, status: VendorApplicationStatus.DRAFT },
    select: { id: true },
  });

  if (!application) {
    throw new Error("Draft application not found.");
  }

  try {
    if (step === 1) {
      const d = step1Schema.parse(rawData);
      return await prisma.vendorApplication.update({
        where: { id: applicationId },
        data: {
          snapshotCompanyName: d.companyName,
          companyRegistrationNumber: d.companyRegistrationNumber,
          snapshotServiceCategory: d.serviceCategory,
          snapshotWebsite: d.website || null,
          tradingName: d.tradingName || null,
          organisationType: d.organisationType,
          physicalAddress: d.physicalAddress,
          postalAddress: d.postalAddress || null,
        },
      });
    }

    if (step === 2) {
      const d = step2Schema.parse(rawData);
      return await prisma.vendorApplication.update({
        where: { id: applicationId },
        data: {
          snapshotContactPersonName: d.contactPersonName,
          snapshotContactEmail: d.contactEmail,
          contactJobTitle: d.contactJobTitle,
          contactPhone: d.contactPhone,
          contactEmployeeNumber: d.contactEmployeeNumber || null,
          preferredContactMethod: d.preferredContactMethod,
        },
      });
    }

    if (step === 3) {
      const d = step3Schema.parse(rawData);
      return await prisma.vendorApplication.update({
        where: { id: applicationId },
        data: {
          verificationReasons: d.verificationReasons,
          otherVerificationReason: d.verificationReasons.includes(OTHER_VERIFICATION_REASON_VALUE)
            ? (d.otherVerificationReason ?? null)
            : null,
          additionalInfo: d.additionalInfo || null,
        },
      });
    }

    // step === 5
    step5Schema.parse(rawData);
    return await prisma.vendorApplication.update({
      where: { id: applicationId },
      data: {
        declarationAccepted: true,
        declarationAcceptedAt: new Date(),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(error.issues.map((issue) => issue.message).join(" "));
    }
    throw error;
  }
}

/** Returns the storage path for a document field, if the application belongs to the given user. */
export async function getOwnedDocumentPath(
  applicationId: string,
  userId: string,
  fieldKey: string,
): Promise<string | null> {
  const documentField = assertDocumentField(fieldKey);

  const application = await prisma.vendorApplication.findFirst({
    where: { id: applicationId, vendorProfile: { userId } },
    select: { [documentField]: true },
  });

  if (!application) {
    throw new Error("Application not found.");
  }

  return application[documentField] as string | null;
}

/** Saves a single document storage path after a successful upload. Returns the path it replaced, if any. */
export async function saveDraftDocumentPath(
  applicationId: string,
  userId: string,
  fieldKey: string,
  storagePath: string,
): Promise<{ previousPath: string | null }> {
  const documentField = assertDocumentField(fieldKey);

  const application = await prisma.vendorApplication.findFirst({
    where: { id: applicationId, vendorProfile: { userId }, status: VendorApplicationStatus.DRAFT },
    select: { id: true, [documentField]: true },
  });

  if (!application) {
    throw new Error("Draft application not found.");
  }

  await prisma.vendorApplication.update({
    where: { id: applicationId },
    data: { [documentField]: storagePath },
  });

  const previousPath = application[documentField] as string | null;
  return { previousPath };
}

/** Verifies a draft document target before storage upload uses the application ID in its object path. */
export async function assertDraftDocumentUploadAllowed(
  applicationId: string,
  userId: string,
  fieldKey: string,
): Promise<void> {
  assertDocumentField(fieldKey);

  const application = await prisma.vendorApplication.findFirst({
    where: { id: applicationId, vendorProfile: { userId }, status: VendorApplicationStatus.DRAFT },
    select: { id: true },
  });

  if (!application) {
    throw new Error("Draft application not found.");
  }
}

/** Clears a document field on the draft. Returns the path that was removed, if any. */
export async function clearDraftDocumentPath(
  applicationId: string,
  userId: string,
  fieldKey: string,
): Promise<{ removedPath: string | null }> {
  const documentField = assertDocumentField(fieldKey);

  const application = await prisma.vendorApplication.findFirst({
    where: { id: applicationId, vendorProfile: { userId }, status: VendorApplicationStatus.DRAFT },
    select: { id: true, [documentField]: true },
  });

  if (!application) {
    throw new Error("Draft application not found.");
  }

  const removedPath = application[documentField] as string | null;
  if (!removedPath) {
    return { removedPath: null };
  }

  await prisma.vendorApplication.update({
    where: { id: applicationId },
    data: { [documentField]: null },
  });

  return { removedPath };
}

/** Validates completeness then transitions the draft from DRAFT → PENDING. */
export async function submitDraftApplication(applicationId: string, userId: string) {
  const updated = await runSerializableTransaction(async (transaction) => {
    const app = await transaction.vendorApplication.findFirst({
      where: { id: applicationId, vendorProfile: { userId }, status: VendorApplicationStatus.DRAFT },
    });

    if (!app) {
      throw new Error("Draft application not found.");
    }

    const missing: string[] = [];
    if (!app.snapshotCompanyName) missing.push("company name");
    if (!app.companyRegistrationNumber) missing.push("registration number");
    if (!app.snapshotServiceCategory) missing.push("service category");
    if (!app.organisationType) missing.push("organisation type");
    if (!app.physicalAddress) missing.push("physical address");
    if (!app.snapshotContactPersonName) missing.push("contact name");
    if (!app.snapshotContactEmail) missing.push("contact email");
    if (!app.contactJobTitle) missing.push("job title");
    if (!app.contactPhone) missing.push("phone number");
    if (!app.preferredContactMethod) missing.push("preferred contact method");
    if (app.verificationReasons.length === 0) missing.push("reason for requesting verification access");
    if (!app.docRegistrationCertificate) missing.push("registration certificate");
    if (!app.docProofOfAddress) missing.push("proof of address");
    if (!app.docRepresentativeId) missing.push("representative ID");
    if (!app.docLetterOfAuthorisation) missing.push("letter of authorisation");
    if (!app.declarationAccepted) missing.push("declaration");

    if (missing.length > 0) {
      throw new Error(
        `Please complete all required fields before submitting: ${missing.join(", ")}.`,
      );
    }

    const updatedApplication = await transaction.vendorApplication.update({
      where: { id: applicationId },
      data: { status: VendorApplicationStatus.PENDING },
    });

    await writeAuditLog(
      {
        action: AuditAction.VENDOR_APPLICATION_SUBMITTED,
        actorId: userId,
        targetType: "vendor_application",
        targetId: applicationId,
        meta: { vendorProfileId: app.vendorProfileId },
      },
      transaction,
    );

    return {
      application: updatedApplication,
      contactEmail: app.snapshotContactEmail!,
      contactName: app.snapshotContactPersonName!,
      companyName: app.snapshotCompanyName!,
    };
  });

  try {
    await sendVendorApplicationSubmittedEmail({
      to: updated.contactEmail,
      contactName: updated.contactName,
      companyName: updated.companyName,
    });
  } catch (error) {
    console.error(
      `[vendor-application] Failed to send submission confirmation email for ${applicationId}:`,
      error instanceof Error ? error.message : String(error),
    );
  }

  return updated.application;
}

/** Returns the step number the wizard should open at (1–5, or 6 for review). */
export function computeDraftProgress(application: {
  snapshotCompanyName: string | null;
  snapshotContactPersonName: string | null;
  verificationReasons: string[];
  docRegistrationCertificate: string | null;
  docProofOfAddress: string | null;
  docRepresentativeId: string | null;
  docLetterOfAuthorisation: string | null;
  declarationAccepted: boolean | null;
}): number {
  if (!application.snapshotCompanyName) return 1;
  if (!application.snapshotContactPersonName) return 2;
  if (application.verificationReasons.length === 0) return 3;
  if (
    !application.docRegistrationCertificate ||
    !application.docProofOfAddress ||
    !application.docRepresentativeId ||
    !application.docLetterOfAuthorisation
  ) {
    return 4;
  }
  if (!application.declarationAccepted) return 5;
  return 6;
}
