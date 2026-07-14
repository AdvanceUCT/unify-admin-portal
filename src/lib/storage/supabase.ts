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
  const ext = file.name.split(".").pop() ?? "bin";
  const path = `${applicationId}/${fieldKey}/${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { upsert: true });

  if (error) throw new Error(`Upload failed: ${error.message}`);
  return { path };
}

export async function getDocumentSignedUrl(
  storagePath: string,
  expiresInSeconds = 3600,
): Promise<string | null> {
  const supabase = getClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds);

  if (error || !data) return null;
  return data.signedUrl;
}
