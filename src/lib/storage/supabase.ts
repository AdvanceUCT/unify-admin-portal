import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/config/env";

const BUCKET = "vendor-documents";

function getClient() {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set to use document storage.",
    );
  }
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
}

export async function uploadVendorDocument(
  file: File,
  applicationId: string,
  fieldKey: string,
): Promise<{ path: string }> {
  const supabase = getClient();
  const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_").replace(/^\.+/, "");
  const path = `${applicationId}/${fieldKey}/${Date.now()}-${safeName || "file"}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { upsert: true });

  if (error) throw new Error(`Upload failed: ${error.message}`);
  return { path };
}

export async function uploadVendorLogo(
  file: File,
  vendorProfileId: string,
): Promise<{ path: string }> {
  const supabase = getClient();
  const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_").replace(/^\.+/, "");
  const path = `logos/${vendorProfileId}/${Date.now()}-${safeName || "file"}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { upsert: true });

  if (error) throw new Error(`Upload failed: ${error.message}`);
  return { path };
}

export async function uploadUniversityLogo(
  file: File,
  universityProfileId: string,
): Promise<{ path: string }> {
  const supabase = getClient();
  const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_").replace(/^\.+/, "");
  const path = `university-logos/${universityProfileId}/${Date.now()}-${safeName || "file"}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { upsert: true });

  if (error) throw new Error(`Upload failed: ${error.message}`);
  return { path };
}

/** Deletes a previously uploaded vendor document, e.g. after it's been replaced. */
export async function deleteVendorDocument(path: string): Promise<void> {
  const supabase = getClient();
  const { error } = await supabase.storage.from(BUCKET).remove([path]);

  if (error) throw new Error(`Delete failed: ${error.message}`);
}

/** Recovers the original filename embedded in a storage path saved by `uploadVendorDocument`. */
export function filenameFromStoragePath(path: string): string {
  const segment = path.split("/").pop() ?? path;
  return segment.replace(/^\d+-/, "");
}

export async function getDocumentSignedUrl(
  storagePath: string,
  expiresInSeconds = 3600,
): Promise<string | null> {
  try {
    const supabase = getClient();
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, expiresInSeconds);

    if (error || !data) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}
