/**
 * @fileoverview Renders the Mark Application Viewed used by `/vendors/[applicationId]/MarkApplicationViewed.tsx`.
 * @module app/(admin)/vendors/[applicationId]/MarkApplicationViewed
 */

"use client";

import { useEffect } from "react";

import { markVendorApplicationViewedAction } from "../actions";

export function MarkApplicationViewed({ applicationId }: { applicationId: string }) {
  useEffect(() => {
    void markVendorApplicationViewedAction(applicationId);
  }, [applicationId]);

  return null;
}
