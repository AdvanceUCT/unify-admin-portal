import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SchemaVersionManager } from "@/features/credentials/SchemaVersionManager";

const attributes = [
  {
    available: true,
    label: "Student number",
    name: "studentNumber",
    source: "system" as const,
  },
];

const versions = [
  {
    attributes: ["studentNumber"],
    createdAt: "2026-08-04T10:00:00.000Z",
    credentialDefinitionId: null,
    id: "schema-draft-1",
    isActive: false,
    publishedAt: null,
    schemaId: null,
    status: "DRAFT" as const,
    version: "2.0",
  },
];

describe("SchemaVersionManager", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("confirms publishing via a dialog before submitting the request", () => {
    render(<SchemaVersionManager attributeAvailability={attributes} versions={versions} />);

    expect(screen.queryByRole("button", { name: "Confirm and publish" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Publish" }));

    expect(screen.getByText(/This registers v2\.0 on the ledger/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm and publish" })).toBeInTheDocument();
  });

  it("shows publish timeout errors inside the confirmation dialog", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: { message: "Agent service request timed out after 60000ms." },
          }),
          { headers: { "Content-Type": "application/json" }, status: 502 },
        ),
      ),
    );

    render(<SchemaVersionManager attributeAvailability={attributes} versions={versions} />);

    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm and publish" }));

    expect(await screen.findByText("Agent service request timed out after 60000ms.")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("/api/credentials/schemas", {
      body: JSON.stringify({ schemaId: "schema-draft-1" }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    });
    // The dialog stays open on failure so the admin can retry or cancel.
    expect(screen.getByRole("button", { name: "Confirm and publish" })).toBeInTheDocument();
  });
});
