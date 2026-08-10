/**
 * @fileoverview Renders the University Logo Upload used by `/settings/UniversityLogoUpload.tsx`.
 * @module app/(admin)/settings/UniversityLogoUpload
 */

"use client";

import { removeUniversityLogoAction, uploadUniversityLogoAction } from "./actions";
import { LogoUpload } from "@/components/ui/LogoUpload";

export function UniversityLogoUpload({ initialLogoUrl }: { initialLogoUrl: string | null }) {
  return (
    <LogoUpload
      alt="University logo"
      initialLogoUrl={initialLogoUrl}
      removeAction={removeUniversityLogoAction}
      removeDialogDescription="The admin portal will fall back to the default icon until a new university logo is uploaded."
      removeDialogTitle="Remove university logo?"
      uploadAction={uploadUniversityLogoAction}
    />
  );
}
