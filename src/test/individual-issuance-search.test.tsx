import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { IndividualIssuanceSearch } from "@/features/credentials/IndividualIssuanceSearch";
import { mockStudents } from "@/lib/api/mockData";

describe("IndividualIssuanceSearch", () => {
  afterEach(() => {
    cleanup();
  });

  it("limits visible student rows to the first 10 results", () => {
    render(<IndividualIssuanceSearch students={mockStudents} />);

    expect(screen.getByText("Showing 1-10 of 100 students")).toBeInTheDocument();
    expect(screen.getByText("Page 1 of 10")).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(11);
  });

  it("filters by full name and links to individual issuance detail", () => {
    render(<IndividualIssuanceSearch students={mockStudents} />);

    fireEvent.change(screen.getByPlaceholderText("Search by name or student number..."), {
      target: { value: "Joshua Wood" },
    });

    expect(screen.getByText("Showing 1-1 of 1 students")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Joshua Wood" })).toHaveAttribute(
      "href",
      "/credentials/issuance/individual/student-demo-100",
    );
  });

  it("filters by student number", () => {
    render(<IndividualIssuanceSearch students={mockStudents} />);

    fireEvent.change(screen.getByPlaceholderText("Search by name or student number..."), {
      target: { value: "WOOJOS100" },
    });

    expect(screen.getByText("Showing 1-1 of 1 students")).toBeInTheDocument();
    expect(screen.getByText("WOOJOS100")).toBeInTheDocument();
  });
});
