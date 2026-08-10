/**
 * @fileoverview Contains the server actions used by the `/vendor` workflow.
 * @module app/vendor/(portal)/actions
 */

"use server";

import { checkAgentHealth } from "@/lib/agentClient";
import { requireVendorSession } from "@/lib/auth/session";

export async function checkVendorAgentHealthAction() {
  await requireVendorSession();
  return checkAgentHealth();
}
