import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getUniversityProfile,
  getUniversityProfileForRender,
} from "@/lib/university/profile";
import {
  getDocumentSignedUrl,
  getDocumentSignedUrlForRender,
} from "@/lib/storage/supabase";

const database = vi.hoisted(() => ({
  universityProfile: {
    findFirst: vi.fn(),
  },
}));

const supabaseStorage = vi.hoisted(() => ({
  createSignedUrl: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: database }));
vi.mock("@/lib/config/env", () => ({
  env: {
    SUPABASE_SERVICE_ROLE_KEY: "service-role",
    SUPABASE_URL: "https://storage.example",
  },
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    storage: {
      from: vi.fn(() => supabaseStorage),
    },
  })),
}));

describe("render-scoped cache boundaries", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps the default university profile reader fresh for mutation flows", async () => {
    database.universityProfile.findFirst
      .mockResolvedValueOnce({ id: "profile-1", name: "Before" })
      .mockResolvedValueOnce({ id: "profile-1", name: "After" });

    await expect(getUniversityProfile()).resolves.toMatchObject({ name: "Before" });
    await expect(getUniversityProfile()).resolves.toMatchObject({ name: "After" });
    expect(database.universityProfile.findFirst).toHaveBeenCalledTimes(2);
  });

  it("keeps the default signed URL reader fresh after an earlier miss", async () => {
    supabaseStorage.createSignedUrl
      .mockResolvedValueOnce({ data: null, error: { message: "missing" } })
      .mockResolvedValueOnce({
        data: { signedUrl: "https://storage.example/signed/logo.png" },
        error: null,
      });

    await expect(getDocumentSignedUrl("logos/profile/logo.png")).resolves.toBeNull();
    await expect(getDocumentSignedUrl("logos/profile/logo.png")).resolves.toBe(
      "https://storage.example/signed/logo.png",
    );
    expect(supabaseStorage.createSignedUrl).toHaveBeenCalledTimes(2);
  });

  it("does not turn render helpers into a persistent cache outside React Server Component renders", async () => {
    database.universityProfile.findFirst
      .mockResolvedValueOnce({ id: "profile-1", name: "First render request" })
      .mockResolvedValueOnce({ id: "profile-1", name: "Second render request" });
    supabaseStorage.createSignedUrl
      .mockResolvedValueOnce({
        data: { signedUrl: "https://storage.example/signed/first.png" },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { signedUrl: "https://storage.example/signed/second.png" },
        error: null,
      });

    await expect(getUniversityProfileForRender()).resolves.toMatchObject({
      name: "First render request",
    });
    await expect(getUniversityProfileForRender()).resolves.toMatchObject({
      name: "Second render request",
    });
    await expect(getDocumentSignedUrlForRender("logos/profile/logo.png")).resolves.toBe(
      "https://storage.example/signed/first.png",
    );
    await expect(getDocumentSignedUrlForRender("logos/profile/logo.png")).resolves.toBe(
      "https://storage.example/signed/second.png",
    );

    expect(database.universityProfile.findFirst).toHaveBeenCalledTimes(2);
    expect(supabaseStorage.createSignedUrl).toHaveBeenCalledTimes(2);
  });
});
