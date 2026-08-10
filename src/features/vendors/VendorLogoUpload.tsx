/**
 * @fileoverview Validates and uploads the vendor logo used by portal branding.
 * @module features/vendors/VendorLogoUpload
 */

"use client";

import { removeLogoAction, uploadLogoAction } from "@/app/vendor/(portal)/profile/actions";
import { LogoUpload } from "@/components/ui/LogoUpload";

export function VendorLogoUpload({ initialLogoUrl }: { initialLogoUrl: string | null }) {
  return (
    <LogoUpload
      initialLogoUrl={initialLogoUrl}
      removeAction={removeLogoAction}
      removeDialogDescription="Your profile and dashboard will fall back to the default icon until you upload a new one."
      removeDialogTitle="Remove organisation logo?"
      uploadAction={uploadLogoAction}
    />
  );
}
