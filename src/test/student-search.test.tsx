import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { StudentSearch } from "@/features/students/StudentSearch";
import { mockStudents } from "@/lib/api/mockData";

describe("StudentSearch", () => {
  afterEach(() => {
    cleanup();
  });

  it("limits visible student rows to the first 10 results", () => {
    render(<StudentSearch initial={mockStudents} />);

    expect(screen.getByText("Showing 1-10 of 100 students")).toBeInTheDocument();
    expect(screen.getByText("Page 1 of 10")).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(11);
  });
});
