import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({
  student: {
    findMany: vi.fn(),
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: database }));
vi.mock("@/lib/university/profile", () => ({ getUniversityProfile: vi.fn() }));

describe("student repository programme filters", () => {
  beforeEach(() => vi.clearAllMocks());

  it("loads only faculty/programme fields and preserves first-seen programme order", async () => {
    const { getStudentProgrammesByFaculty } = await import("@/lib/students/repository");
    database.student.findMany.mockResolvedValue([
      { faculty: "Science", programme: "BSc" },
      { faculty: "Science", programme: "BSc" },
      { faculty: "Commerce", programme: "BCom" },
      { faculty: "Science", programme: "MSc" },
    ]);

    await expect(getStudentProgrammesByFaculty()).resolves.toEqual({
      Science: ["BSc", "MSc"],
      Commerce: ["BCom"],
    });
    expect(database.student.findMany).toHaveBeenCalledWith({
      orderBy: { lastName: "asc" },
      select: { faculty: true, programme: true },
      where: {
        faculty: { not: null },
        programme: { not: null },
      },
    });
  });
});
