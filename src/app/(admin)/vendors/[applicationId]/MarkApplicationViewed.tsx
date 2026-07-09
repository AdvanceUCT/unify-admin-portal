"use client";

import { useEffect } from "react";

import { markVendorApplicationViewedAction } from "../actions";

export function MarkApplicationViewed({ applicationId }: { applicationId: string }) {
  useEffect(() => {
    void markVendorApplicationViewedAction(applicationId);
  }, [applicationId]);

  return null;
}
