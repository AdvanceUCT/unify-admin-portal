/** Shared detail layouts used by both portals where the actual UI is shared. */
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
  SkeletonTable,
} from "./SkeletonPrimitives";

export function InvoiceDetailSkeleton({ admin = false }: { admin?: boolean }) {
  return (
    <SkeletonPage label="Loading invoice details">
      <SkeletonBack />
      <SkeletonCard description>
        <div className="grid gap-4 sm:grid-cols-2">
          <SkeletonHeading />
          <SkeletonHeading />
        </div>
        <SkeletonTable columns={5} rows={3} header={false} framed={false} />
        <SkeletonAction />
      </SkeletonCard>
      {admin && <SkeletonTable columns={5} rows={3} />}
    </SkeletonPage>
  );
}

export function AdminInvoiceDetailSkeleton() {
  return <InvoiceDetailSkeleton admin />;
}

export function PaymentReturnSkeleton() {
  return (
    <SkeletonPage label="Loading payment confirmation">
      <SkeletonBack />
      <SkeletonCard header={false}>
        <SkeletonHeading />
        <SkeletonBlock className="h-6 w-28" />
        <SkeletonFacts count={3} />
        <SkeletonAction align="left" />
      </SkeletonCard>
    </SkeletonPage>
  );
}

export function PayoutHistorySkeleton() {
  return (
    <SkeletonPage label="Loading payout history">
      <SkeletonBack />
      <SkeletonCard header={false}>
        <SkeletonHeading />
        <SkeletonFacts count={2} />
        <SkeletonFields count={4} />
      </SkeletonCard>
      <SkeletonTable columns={6} pagination />
    </SkeletonPage>
  );
}

export function VendorApplicationDetailSkeleton() {
  return (
    <SkeletonPage label="Loading vendor application details">
      <SkeletonBack />
      <SkeletonHeading />
      <SkeletonCard description>
        <SkeletonFacts count={5} />
      </SkeletonCard>
      <SkeletonCard>
        <SkeletonFacts count={4} />
      </SkeletonCard>
      <SkeletonCard>
        <SkeletonList rows={3} />
      </SkeletonCard>
    </SkeletonPage>
  );
}

export function VendorVerificationHistorySkeleton() {
  return (
    <SkeletonPage label="Loading vendor verification history">
      <SkeletonBack />
      <SkeletonHeading />
      <SkeletonMetrics count={2} />
      <SkeletonTable columns={5} rows={4} />
      <SkeletonCard header={false}>
        <SkeletonFields count={3} columns={3} />
      </SkeletonCard>
      <SkeletonTable columns={6} pagination />
    </SkeletonPage>
  );
}

export function PaymentsAboutSkeleton() {
  return (
    <SkeletonPage label="Loading wallet payment information">
      <SkeletonBack />
      <SkeletonCard header={false}>
        <SkeletonHeading />
        {[0, 1, 2].map((i) => (
          <div className="space-y-3 py-4" key={i}>
            <SkeletonBlock className="h-6 w-60" />
            <SkeletonBlock className="h-4 w-full" />
            <SkeletonBlock className="h-4 w-full" />
            <SkeletonBlock className="h-4 w-3/4" />
          </div>
        ))}
      </SkeletonCard>
    </SkeletonPage>
  );
}
