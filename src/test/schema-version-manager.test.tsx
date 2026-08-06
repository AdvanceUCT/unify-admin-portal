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

  it("shows publish timeout errors in the schema history panel", async () => {
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

    expect(await screen.findByText("Agent service request timed out after 60000ms.")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("/api/credentials/schemas", {
      body: JSON.stringify({ schemaId: "schema-draft-1" }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    });
  });
});
