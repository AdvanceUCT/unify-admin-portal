/**
 * @fileoverview Keeps the payments page wallet banner and balance card current without a page refresh.
 * @module app/vendor/(portal)/payments/LiveWalletOverview
 */

"use client";

import { useEffect, useState } from "react";

import { VendorWalletBalanceCard } from "./VendorWalletBalanceCard";
import { VendorWalletStatusBanner } from "./VendorWalletStatusBanner";
import { WALLET_REFRESH_EVENT, WALLET_UPDATED_EVENT, type VendorWalletOverview } from "./walletOverview";

// Payments and refunds request an immediate refresh; this interval catches payouts, top-ups and POS refunds.
const POLL_INTERVAL_MS = 5_000;

export function LiveWalletOverview({
  initialOverview,
  showBalanceCard,
}: {
  initialOverview: VendorWalletOverview;
  showBalanceCard: boolean;
}) {
  const [overview, setOverview] = useState(initialOverview);

  useEffect(() => {
    let cancelled = false;
    let controller: AbortController | null = null;
    let fetching = false;
    let pending = false;

    async function refresh() {
      if (cancelled || document.visibilityState !== "visible") return;
      // Coalesce bursts (e.g. several payments in one poll) into at most one follow-up fetch.
      if (fetching) {
        pending = true;
        return;
      }
      fetching = true;
      controller = new AbortController();
      try {
        const response = await fetch("/api/vendor/wallet/overview", { cache: "no-store", signal: controller.signal });
        if (!response.ok) return;
        const next = await response.json() as VendorWalletOverview;
        if (cancelled) return;
        setOverview(next);
        window.dispatchEvent(new CustomEvent<VendorWalletOverview>(WALLET_UPDATED_EVENT, { detail: next }));
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      } finally {
        controller = null;
        fetching = false;
        if (pending && !cancelled) {
          pending = false;
          void refresh();
        }
      }
    }

    const onRefresh = () => void refresh();
    const onVisibility = () => { if (document.visibilityState === "visible") void refresh(); };
    const timer = window.setInterval(onRefresh, POLL_INTERVAL_MS);
    window.addEventListener(WALLET_REFRESH_EVENT, onRefresh);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      controller?.abort();
      window.clearInterval(timer);
      window.removeEventListener(WALLET_REFRESH_EVENT, onRefresh);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <>
      <VendorWalletStatusBanner overview={overview} />
      {showBalanceCard ? <VendorWalletBalanceCard canRunDemoPayout overview={overview} /> : null}
    </>
  );
}
