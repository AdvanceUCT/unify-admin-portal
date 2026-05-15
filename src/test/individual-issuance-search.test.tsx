import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { IndividualIssuanceSearch } from "@/features/credentials/IndividualIssuanceSearch";
import { mockStudents } from "@/lib/api/mockData";

describe("IndividualIssuanceSearch", () => {
  afterEach(() => {
    cleanup();
  });

  it("filters by full name and links to individual issuance detail", () => {
    render(<IndividualIssuanceSearch students={mockStudents} />);

    fireEvent.change(screen.getByPlaceholderText("Search by name or student number..."), {
      target: { value: "Joshua Wood" },
    });

    expect(screen.getByText("Showing 1 of 100 students")).toBeInTheDocument();
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

    expect(screen.getByText("Showing 1 of 100 students")).toBeInTheDocument();
    expect(screen.getByText("WOOJOS100")).toBeInTheDocument();
  });
});
