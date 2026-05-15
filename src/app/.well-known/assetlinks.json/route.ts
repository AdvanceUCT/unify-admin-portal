import { NextResponse } from "next/server";

const defaultDebugFingerprint = "FA:C6:8E:46:09:A7:72:8B:68:95:C8:BB:93:01:5F:D4:7A:6D:DB:D3:35:F0:10:24:4B:62:C9:10:19:68:8C:0B";

function fingerprints() {
  const configured = process.env.ANDROID_APP_LINK_SHA256_CERT_FINGERPRINTS ?? process.env.ANDROID_APP_LINK_SHA256_CERT_FINGERPRINT;
  return (configured ?? defaultDebugFingerprint)
    .split(",")
    .map((fingerprint) => fingerprint.trim())
    .filter(Boolean);
}

export function GET() {
  return NextResponse.json(
    [
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: "com.advanceuct.unifystudentwallet",
          sha256_cert_fingerprints: fingerprints(),
        },
      },
    ],
    {
      headers: {
        "Cache-Control": "public, max-age=3600",
      },
    },
  );
}
