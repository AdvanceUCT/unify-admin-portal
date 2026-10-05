import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
import { RenewalFilters } from "@/features/credentials/RenewalFilters";
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it("applies student and renewal filters while preserving the exact period and resetting pagination", () => {
  render(<RenewalFilters params={{ view: "upcoming", year: "2027", periodStart: "2027-01-31T22:00:00.000Z", periodExpiry: "2027-11-30T22:00:00.000Z", page: "3" }} programmesByFaculty={{ Science: ["Computing"], Arts: ["History"] }} />);
  fireEvent.change(screen.getByRole("textbox", { name: "Search students" }), { target: { value: "ST-123" } });
  fireEvent.change(screen.getByRole("combobox", { name: "Faculty" }), { target: { value: "Science" } });
  expect(screen.queryByRole("option", { name: "History" })).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole("combobox", { name: "Programme" }), { target: { value: "Computing" } });
  fireEvent.change(screen.getByRole("combobox", { name: "Renewal status" }), { target: { value: "FAILED" } });
  fireEvent.click(screen.getByRole("button", { name: "Apply" }));
  const params = new URL(push.mock.calls[0][0], "https://example.invalid").searchParams;
  expect(Object.fromEntries(params)).toEqual({ view: "upcoming", year: "2027", periodStart: "2027-01-31T22:00:00.000Z", periodExpiry: "2027-11-30T22:00:00.000Z", student: "ST-123", faculty: "Science", programme: "Computing", status: "FAILED" });
  fireEvent.click(screen.getByRole("button", { name: "Clear" }));
  expect(new URL(push.mock.calls[1][0], "https://example.invalid").searchParams.has("year")).toBe(true);
  expect(new URL(push.mock.calls[1][0], "https://example.invalid").searchParams.has("status")).toBe(false);
});
it("clears the programme when faculty changes and shows delivery outcomes in history", () => {
  render(<RenewalFilters params={{ view: "history", faculty: "Science", programme: "Computing" }} programmesByFaculty={{ Science: ["Computing"], Arts: ["History"] }} />);
  fireEvent.change(screen.getByRole("combobox", { name: "Faculty" }), { target: { value: "Arts" } });
  expect(screen.getByRole("combobox", { name: "Programme" })).toHaveValue("");
  expect(screen.getByRole("option", { name: "Offer sent" })).toBeInTheDocument();
  expect(screen.queryByRole("option", { name: "Awaiting activation" })).not.toBeInTheDocument();
  expect(screen.getByLabelText("From date")).toBeInTheDocument();
});
