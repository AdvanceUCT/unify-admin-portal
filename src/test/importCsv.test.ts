import { describe, expect, it, vi } from "vitest";

import { parseCsvHeader } from "@/lib/imports/csv";

vi.mock("server-only", () => ({}));

describe("parseCsvHeader", () => {
  it("detects columns from the header row", () => {
    const { columns, errors } = parseCsvHeader("Student No,First Name,Last Name,Email\n1,Ada,Lovelace,ada@example.edu\n");

    expect(columns).toEqual(["Student No", "First Name", "Last Name", "Email"]);
    expect(errors).toEqual([]);
  });

  it("trims whitespace around column names", () => {
    const { columns } = parseCsvHeader(" Student No , First Name \n1,Ada\n");

    expect(columns).toEqual(["Student No", "First Name"]);
  });

  it("returns no columns for an empty file", () => {
    const { columns } = parseCsvHeader("");

    expect(columns).toEqual([]);
  });

  it("drops blank column names", () => {
    const { columns } = parseCsvHeader("Student No,,Last Name\n1,,Lovelace\n");

    expect(columns).toEqual(["Student No", "Last Name"]);
  });
});
