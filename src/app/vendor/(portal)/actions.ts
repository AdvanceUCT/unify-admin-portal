"use server";

import { checkAgentHealth } from "@/lib/agentClient";
import { requireVendorSession } from "@/lib/auth/session";

export async function checkVendorAgentHealthAction() {
  await requireVendorSession();
  return checkAgentHealth();
}
