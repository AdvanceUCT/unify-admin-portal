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
    version: null,
  },
];

function renderManager() {
  return render(
    <SchemaVersionManager
      attributeAvailability={attributes}
      nextPublishVersion="2.0"
      versions={versions}
    />,
  );
}

describe("SchemaVersionManager", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("confirms publishing via a dialog before submitting the request", () => {
    renderManager();

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

    renderManager();

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

  it("confirms deleting a draft via a dialog before submitting the request", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
    );

    renderManager();

    expect(screen.queryByRole("button", { name: "Confirm and delete" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(screen.getByText(/permanently deletes this local draft/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Confirm and delete" }));

    expect(await screen.findByText("Schema draft deleted.")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("/api/credentials/schemas", {
      body: JSON.stringify({ schemaId: "schema-draft-1" }),
      headers: { "Content-Type": "application/json" },
      method: "DELETE",
    });
  });

  it("shows delete errors inside the confirmation dialog and keeps it open", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ error: { message: "Only draft schema versions can be deleted." } }),
          { headers: { "Content-Type": "application/json" }, status: 409 },
        ),
      ),
    );

    renderManager();

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm and delete" }));

    expect(await screen.findByText("Only draft schema versions can be deleted.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm and delete" })).toBeInTheDocument();
  });

  it("creates an unversioned draft and previews the next publish version", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ id: "schema-draft-2", schemaVersion: null, status: "DRAFT" }),
          { headers: { "Content-Type": "application/json" }, status: 201 },
        ),
      ),
    );

    renderManager();

    expect(screen.queryByLabelText("Version")).not.toBeInTheDocument();
    expect(screen.getByText("v2.0")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Create draft" }));

    expect(await screen.findByText("Schema draft created.")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("/api/credentials/schemas", {
      body: JSON.stringify({ attributes: ["studentNumber"] }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
  });
});
