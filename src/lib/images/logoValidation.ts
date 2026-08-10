export type LogoValidationResult =
  | { ok: true }
  | { ok: false; error: string };

const ALLOWED_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_FILE_BYTES = 2 * 1024 * 1024;

export async function validateLogoFile(file: File): Promise<LogoValidationResult> {
  if (file.size > MAX_FILE_BYTES) {
    return {
      ok: false,
      error: "This file is too large. Please upload an image that's 2 MB or smaller.",
    };
  }
  if (!ALLOWED_MIME_TYPES.includes(file.type) || !(await hasExpectedImageSignature(file))) {
    return { ok: false, error: "That file is not a valid PNG, JPEG, or WEBP image." };
  }

  return { ok: true };
}

async function hasExpectedImageSignature(file: File) {
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (file.type === "image/png") {
    return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
      (value, index) => bytes[index] === value,
    );
  }
  if (file.type === "image/jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (file.type === "image/webp") {
    return (
      String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
    );
  }
  return false;
}
