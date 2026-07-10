"use server";

import { revalidatePath } from "next/cache";

import { assertCan } from "@/lib/auth/permissions";
import { requireRole } from "@/lib/auth/session";
import type { RenewalCadenceMonths } from "@/lib/credentials/renewalCadence";
import { updateRenewalCadence } from "@/lib/university/profile";

export async function updateRenewalCadenceAction(formData: FormData) {
  const session = await requireRole(["SUPER_ADMIN", "ADMIN"]);
  assertCan("renewal:write", session);

  const raw = String(formData.get("months") ?? "");
  const months = raw === "" ? null : (Number(raw) as RenewalCadenceMonths);

  await updateRenewalCadence({ actorId: session.user.id, months });

  revalidatePath("/credentials/issuance/renewals");
}
