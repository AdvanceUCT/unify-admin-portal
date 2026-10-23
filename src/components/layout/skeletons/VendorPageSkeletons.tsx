/** Vendor route compositions; no session or database reads delay the fallback. */
import {
  SkeletonAction,
  SkeletonBack,
  SkeletonBlock,
  SkeletonCard,
  SkeletonFacts,
  SkeletonFields,
  SkeletonHeading,
  SkeletonList,
  SkeletonMetrics,
  SkeletonPage,
  SkeletonQr,
  SkeletonTable,
  SkeletonTabs,
} from "./SkeletonPrimitives";

export function VendorOverviewSkeleton() {
  return (
    <SkeletonPage label="Loading vendor overview">
      <SkeletonBlock className="h-16 w-full" />
      <SkeletonMetrics vendor />
      <div className="grid gap-6 lg:grid-cols-2">
        <SkeletonQr />
        <SkeletonCard header={false}>
          <SkeletonHeading />
          <SkeletonList rows={3} />
        </SkeletonCard>
      </div>
      <SkeletonCard>
        <SkeletonBlock className="h-10 w-full" />
      </SkeletonCard>
      <SkeletonCard>
        <SkeletonList rows={5} avatar />
      </SkeletonCard>
      <SkeletonCard>
        <SkeletonList rows={5} avatar />
      </SkeletonCard>
      <SkeletonCard>
        <SkeletonList rows={2} />
      </SkeletonCard>
      <SkeletonCard header={false}>
        <SkeletonBlock className="h-12 w-full" />
      </SkeletonCard>
    </SkeletonPage>
  );
}

export function VendorVerificationsSkeleton() {
  return (
    <SkeletonPage label="Loading verification history">
      <SkeletonCard header={false}>
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,1fr))_auto]">
          {Array.from({ length: 5 }, (_, i) => (
            <SkeletonFields columns={1} count={1} key={i} />
          ))}
          <div className="self-end">
            <SkeletonBlock className="h-10 w-28" />
          </div>
        </div>
      </SkeletonCard>
      <SkeletonTable columns={8} minWidth="60rem" pagination />
    </SkeletonPage>
  );
}

export function VendorPaymentsSkeleton() {
  return (
    <SkeletonPage label="Loading vendor payments">
      <SkeletonAction />
      <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-md">
        <div className="grid lg:grid-cols-[1.25fr_0.9fr]">
          <div className="space-y-4 p-6 sm:p-7">
            <SkeletonBlock className="h-5 w-36" />
            <SkeletonBlock className="h-12 w-56" />
            <SkeletonBlock className="h-4 w-80" />
            <SkeletonBlock className="h-2 w-full" />
            <SkeletonBlock className="h-4 w-48" />
          </div>
          <div className="space-y-4 border-t border-border p-6 sm:p-7 lg:border-l lg:border-t-0">
            <SkeletonBlock className="h-10 w-full" />
            <SkeletonFacts count={2} />
            <SkeletonAction align="left" />
          </div>
        </div>
      </section>
      <SkeletonCard header={false}>
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))_auto]">
          {Array.from({ length: 4 }, (_, i) => (
            <SkeletonFields columns={1} count={1} key={i} />
          ))}
          <div className="self-end">
            <SkeletonBlock className="h-10 w-28" />
          </div>
        </div>
      </SkeletonCard>
      <SkeletonTable columns={9} minWidth="72rem" pagination />
    </SkeletonPage>
  );
}

export function BranchesSkeleton() {
  return (
    <SkeletonPage label="Loading vendor branches">
      <SkeletonCard header={false}>
        <SkeletonBlock className="h-5 w-40" />
        <SkeletonFields count={2} />
        <SkeletonAction align="left" />
      </SkeletonCard>
      <SkeletonCard>
        <SkeletonList rows={3} />
      </SkeletonCard>
    </SkeletonPage>
  );
}

export function BranchDetailSkeleton() {
  return (
    <SkeletonPage label="Loading branch details">
      <SkeletonBack />
      <SkeletonCard header={false}>
        <SkeletonHeading />
        <SkeletonFacts count={2} />
      </SkeletonCard>
      <SkeletonMetrics vendor />
      <div className="grid gap-6 lg:grid-cols-2">
        <SkeletonQr />
        <SkeletonQr />
        <SkeletonCard header={false}>
          <SkeletonHeading />
          <SkeletonFields count={2} />
          <SkeletonAction />
        </SkeletonCard>
      </div>
      <SkeletonCard>
        <SkeletonList rows={5} avatar />
      </SkeletonCard>
      <SkeletonCard>
        <SkeletonList rows={5} avatar />
      </SkeletonCard>
    </SkeletonPage>
  );
}

export function VendorStaffSkeleton() {
  return (
    <SkeletonPage label="Loading vendor staff">
      <SkeletonCard header={false}>
        <SkeletonBlock className="h-5 w-44" />
        <SkeletonFields count={2} />
        <SkeletonFields count={1} columns={1} />
        <SkeletonAction align="left" />
      </SkeletonCard>
      <SkeletonCard>
        <SkeletonList rows={3} />
      </SkeletonCard>
      <SkeletonCard>
        <SkeletonList rows={2} />
      </SkeletonCard>
    </SkeletonPage>
  );
}

export function VendorProfileSkeleton() {
  return (
    <SkeletonPage label="Loading vendor profile">
      <SkeletonCard header={false}>
        <SkeletonBlock className="h-4 w-40" />
        <div className="flex items-center gap-4">
          <SkeletonBlock className="size-20" />
          <SkeletonBlock className="h-10 w-40" />
        </div>
      </SkeletonCard>
      <SkeletonCard header={false}>
        <SkeletonFacts count={4} />
        <SkeletonAction align="left" />
      </SkeletonCard>
      <div className="space-y-4 border-t border-border pt-5">
        <SkeletonHeading description={false} />
        <SkeletonFacts count={3} />
        <SkeletonAction align="left" />
      </div>
    </SkeletonPage>
  );
}

export function VendorHelpSkeleton() {
  return (
    <SkeletonPage label="Loading vendor support">
      <SkeletonCard header={false}>
        <SkeletonHeading />
        <SkeletonFields columns={1} count={1} />
        <SkeletonBlock className="h-4 w-24" />
        <SkeletonBlock className="h-36 w-full" />
        <SkeletonAction align="left" />
      </SkeletonCard>
    </SkeletonPage>
  );
}

export function VendorApplicationSkeleton() {
  return (
    <SkeletonPage label="Loading vendor application">
      <SkeletonCard header={false}>
        <div className="flex items-center gap-4">
          <SkeletonBlock className="size-14 shrink-0 rounded-full" />
          <SkeletonHeading />
        </div>
        <SkeletonBlock className="h-6 w-28" />
      </SkeletonCard>
      <SkeletonTabs count={5} />
      <SkeletonCard header={false}>
        <SkeletonHeading />
        <SkeletonFields count={6} />
        <SkeletonAction />
      </SkeletonCard>
      <SkeletonCard>
        <SkeletonList rows={2} />
      </SkeletonCard>
    </SkeletonPage>
  );
}

export function VendorInvoicesSkeleton() {
  return (
    <SkeletonPage label="Loading vendor invoices">
      <SkeletonTable columns={5} />
    </SkeletonPage>
  );
}

export function PaymentAccessSkeleton() {
  return (
    <SkeletonPage label="Loading branch payment access">
      <SkeletonHeading />
      <div className="border-y border-border">
        <SkeletonList rows={3} />
      </div>
    </SkeletonPage>
  );
}

export function PaymentAccessDetailSkeleton() {
  return (
    <SkeletonPage
      label="Loading payment access application"
      className="mx-auto max-w-3xl space-y-6"
    >
      <SkeletonBack />
      <SkeletonHeading />
      <div className="space-y-4 border-t border-border pt-5">
        <SkeletonHeading description={false} />
        <SkeletonFacts count={2} />
      </div>
      <div className="space-y-4 border-t border-border pt-5">
        <SkeletonHeading description={false} />
        <SkeletonFields count={3} />
        <SkeletonAction align="left" />
      </div>
      <div className="space-y-4 border-t border-border pt-5">
        <SkeletonHeading description={false} />
        <SkeletonBlock className="h-20 w-full" />
        <SkeletonAction align="left" />
      </div>
    </SkeletonPage>
  );
}

/** Integrations has a persistent heading and navigation in its parent layout. */
export function IntegrationWorkflowSkeleton() {
  return (
    <SkeletonPage label="Loading integration guide">
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_11rem]">
        <div className="min-w-0 space-y-9">
          <SkeletonHeading />
          <SkeletonBlock className="h-20 w-full" />
          <SkeletonFields count={2} />
          <SkeletonBlock className="h-64 w-full" />
          <SkeletonHeading />
          <SkeletonBlock className="h-48 w-full" />
        </div>
        <div className="hidden space-y-4 lg:block">
          <SkeletonBlock className="h-4 w-24" />
          <SkeletonBlock className="h-4 w-full" />
          <SkeletonBlock className="h-4 w-28" />
          <SkeletonBlock className="h-4 w-full" />
        </div>
      </div>
    </SkeletonPage>
  );
}

export function IntegrationKeysSkeleton() {
  return (
    <SkeletonPage label="Loading integration API keys">
      <SkeletonHeading />
      <SkeletonFields count={2} />
      <SkeletonBlock className="h-24 w-full" />
      <SkeletonAction align="left" />
      <div className="space-y-4 border-t border-border pt-5">
        <SkeletonHeading description={false} />
        <SkeletonList rows={3} />
      </div>
      <div className="space-y-4 border-t border-border pt-5">
        <SkeletonHeading description={false} />
        <SkeletonFacts count={3} />
      </div>
    </SkeletonPage>
  );
}

export function VendorTopUpSkeleton() {
  return (
    <SkeletonPage label="Loading wallet top-up">
      <SkeletonBack />
      <SkeletonCard header={false}>
        <SkeletonHeading />
        <SkeletonFacts count={3} />
        <SkeletonFields count={1} columns={1} />
        <SkeletonAction align="left" />
      </SkeletonCard>
    </SkeletonPage>
  );
}

export function PaymentRequestsSkeleton() {
  return (
    <SkeletonPage label="Loading POS payment requests">
      <SkeletonHeading />
      <SkeletonTable columns={5} header={false} />
    </SkeletonPage>
  );
}

export function PaymentRequestSkeleton() {
  return (
    <SkeletonPage label="Loading POS payment request">
      <SkeletonBack />
      <SkeletonHeading />
      <SkeletonCard header={false}>
        <SkeletonFacts count={6} />
        <SkeletonAction align="left" />
      </SkeletonCard>
    </SkeletonPage>
  );
}

export function VendorTestToolsSkeleton() {
  return (
    <SkeletonPage label="Loading vendor test tools">
      <SkeletonCard description>
        <SkeletonFields count={3} />
        <SkeletonBlock className="h-24 w-full" />
        <SkeletonAction />
      </SkeletonCard>
    </SkeletonPage>
  );
}
