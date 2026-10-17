import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePathname } from "next/navigation";
import { IntegrationRouteShell } from "@/features/vendors/integrations/IntegrationRouteShell";
import { legacyIntegrationDestination } from "@/lib/vendors/integrationNavigation";
import { endpoints } from "@/lib/vendors/integrationGuide";
vi.mock("next/navigation", () => ({ usePathname: vi.fn() }));
afterEach(cleanup);
describe("integration navigation", () => {
 it.each(["/vendor/integrations", "/vendor/integrations/payments", "/vendor/integrations/keys"])("keeps one heading, one active link and consistent navigation at %s", path => { vi.mocked(usePathname).mockReturnValue(path); render(<IntegrationRouteShell><h2>Workflow</h2></IntegrationRouteShell>); expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1); expect(screen.getByRole("navigation").querySelectorAll("a")).toHaveLength(3); expect(screen.getByRole("navigation").querySelector('[aria-current="page"]')).toHaveAttribute("href", path); });
 it("maps every old endpoint bookmark to its canonical workflow", () => { for (const endpoint of endpoints) expect(legacyIntegrationDestination("/vendor/integrations/reference", "", `#${endpoint.id}`)).toBe(`${endpoint.group === "verification" ? "/vendor/integrations" : "/vendor/integrations/payments"}#${endpoint.id}`); });
 it("maps callback types and guide steps without allowing arbitrary destinations", () => { expect(legacyIntegrationDestination("/vendor/integrations/callbacks", "?type=payments")).toBe("/vendor/integrations/payments#webhooks"); expect(legacyIntegrationDestination("/vendor/integrations/guides/refunds", "", "#step-4")).toBe("/vendor/integrations/payments#refund-step-4"); expect(legacyIntegrationDestination("/vendor/integrations/reference", "", "#unknown")).toBe("/vendor/integrations#setup"); expect(legacyIntegrationDestination("/vendor/integrations/guides/foreign")).toBeNull(); });
});
