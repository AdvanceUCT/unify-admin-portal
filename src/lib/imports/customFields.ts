import "server-only";

import type { CustomFieldDefinition } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { SYSTEM_FIELDS } from "@/lib/imports/mapping";

export class SystemFieldNameCollisionError extends Error {
  status = 409;
}

export class DuplicateCustomFieldKeyError extends Error {
  status = 409;
}

export class CustomFieldNotFoundError extends Error {
  status = 404;
}

export async function getActiveCustomFieldDefinitions(universityProfileId: string): Promise<CustomFieldDefinition[]> {
  return prisma.customFieldDefinition.findMany({
    orderBy: { createdAt: "asc" },
    where: { removedAt: null, universityProfileId },
  });
}

/**
 * Adds a new custom field, or reactivates a previously removed one with the
 * same key (case-insensitive) instead of creating an ambiguous duplicate —
 * the reactivated row keeps its original key casing so it still matches
 * whatever casing is already stored in `Student.attributes`, only the label
 * is updated.
 */
export async function addCustomFieldDefinition(params: {
  universityProfileId: string;
  key: string;
  label: string;
}): Promise<CustomFieldDefinition> {
  const key = params.key.trim();
  const label = params.label.trim();

  if (!key || !label) {
    throw new Error("A custom field needs both a key and a label.");
  }

  if (SYSTEM_FIELDS.some((field) => field.name.toLowerCase() === key.toLowerCase())) {
    throw new SystemFieldNameCollisionError(`"${key}" is a system field and can't be used as a custom field key.`);
  }

  const existingActive = await prisma.customFieldDefinition.findFirst({
    where: { key: { equals: key, mode: "insensitive" }, removedAt: null, universityProfileId: params.universityProfileId },
  });

  if (existingActive) {
    throw new DuplicateCustomFieldKeyError(`A custom field with key "${key}" already exists.`);
  }

  const removed = await prisma.customFieldDefinition.findFirst({
    orderBy: { removedAt: "desc" },
    where: { key: { equals: key, mode: "insensitive" }, removedAt: { not: null }, universityProfileId: params.universityProfileId },
  });

  if (removed) {
    return prisma.customFieldDefinition.update({
      data: { label, removedAt: null },
      where: { id: removed.id },
    });
  }

  return prisma.customFieldDefinition.create({
    data: { key, label, universityProfileId: params.universityProfileId },
  });
}

/**
 * Soft-deletes an active custom field so it stops being a mapping target
 * for future imports. Never touches `Student.attributes` — historical data
 * stored under this key on already-imported students is left exactly as is.
 */
export async function removeCustomFieldDefinition(params: {
  universityProfileId: string;
  key: string;
}): Promise<void> {
  const result = await prisma.customFieldDefinition.updateMany({
    data: { removedAt: new Date() },
    where: { key: params.key, removedAt: null, universityProfileId: params.universityProfileId },
  });

  if (result.count === 0) {
    throw new CustomFieldNotFoundError(`No active custom field with key "${params.key}" was found.`);
  }
}
