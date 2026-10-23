/** Admin route compositions mirror the corresponding page's stable layout. */
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
  SkeletonTabs,
} from "./SkeletonPrimitives";

export function AdminOverviewSkeleton() {
  return (
    <SkeletonPage label="Loading admin overview">
      <SkeletonMetrics />
      <SkeletonTable columns={4} />
    </SkeletonPage>
  );
}

export function StudentsSkeleton({ issuance = false }: { issuance?: boolean }) {
  return (
    <SkeletonPage
      label={issuance ? "Loading individual issuance" : "Loading students"}
      className="space-y-4"
    >
      {!issuance && <SkeletonAction />}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-4 shadow-md">
        <SkeletonBlock className="h-9 w-full sm:w-72" />
        <SkeletonBlock className="h-9 w-full sm:w-52" />
        <SkeletonBlock className="h-9 w-full sm:w-52" />
      </div>
      <SkeletonBlock className="h-4 w-48" />
      <SkeletonTable columns={4} header={false} pagination />
    </SkeletonPage>
  );
}

export function StudentDetailSkeleton() {
  return (
    <SkeletonPage label="Loading student credential">
      <SkeletonBack />
      <div className="grid items-start gap-6 lg:grid-cols-[18rem_1fr]">
        <SkeletonCard header={false}>
          <SkeletonHeading />
          <SkeletonBlock className="h-6 w-24" />
          <SkeletonFacts />
        </SkeletonCard>
        <div className="min-w-0 space-y-6">
          <SkeletonCard description>
            <SkeletonFacts count={3} />
            <SkeletonFields count={2} />
            <SkeletonAction />
          </SkeletonCard>
          <SkeletonCard>
            <SkeletonFacts count={3} />
          </SkeletonCard>
        </div>
      </div>
    </SkeletonPage>
  );
}

export function StudentImportSkeleton() {
  return (
    <SkeletonPage label="Loading student import">
      <SkeletonHeading />
      <SkeletonTabs count={2} />
      <div className="grid gap-2 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <SkeletonBlock className="h-16 w-full" key={i} />
        ))}
      </div>
      <SkeletonCard header={false}>
        <SkeletonHeading />
        <SkeletonBlock className="h-40 w-full" />
        <SkeletonAction />
      </SkeletonCard>
    </SkeletonPage>
  );
}

export function ImportFieldsSkeleton() {
  return (
    <SkeletonPage label="Loading import fields">
      <SkeletonHeading />
      <SkeletonTabs count={2} />
      <SkeletonTable columns={4} />
      <SkeletonTable columns={4} rows={2} />
      <SkeletonHeading />
      <SkeletonCard header={false}>
        <SkeletonFields count={3} />
        <SkeletonAction />
      </SkeletonCard>
    </SkeletonPage>
  );
}

export function CredentialSchemasSkeleton() {
  return (
    <SkeletonPage label="Loading credential schemas">
      <SkeletonCard description>
        <SkeletonList rows={2} />
        <SkeletonBlock className="h-14 w-full" />
      </SkeletonCard>
      <SkeletonCard description>
        <SkeletonFields count={2} />
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <SkeletonBlock className="h-10 w-full" key={i} />
          ))}
        </div>
        <SkeletonAction />
      </SkeletonCard>
    </SkeletonPage>
  );
}

export function BatchIssuanceSkeleton() {
  return (
    <SkeletonPage label="Loading batch issuance">
      <SkeletonCard header={false}>
        <div className="flex flex-wrap justify-between gap-4">
          <SkeletonHeading />
          <SkeletonBlock className="h-9 w-36" />
        </div>
        <SkeletonFields count={3} columns={3} />
        <SkeletonBlock className="h-16 w-full" />
        <SkeletonAction />
      </SkeletonCard>
      <SkeletonTable columns={5} />
    </SkeletonPage>
  );
}

export function BatchRunsSkeleton() {
  return (
    <SkeletonPage label="Loading batch history">
      <SkeletonBack />
      <SkeletonHeading />
      <SkeletonTable columns={4} header={false} />
    </SkeletonPage>
  );
}

export function BatchRunSkeleton() {
  return (
    <SkeletonPage label="Loading batch progress">
      <SkeletonBack />
      <SkeletonHeading />
      <SkeletonCard header={false}>
        <SkeletonHeading />
        <SkeletonBlock className="h-6 w-28" />
        <SkeletonFacts count={3} />
        <SkeletonBlock className="h-3 w-full" />
        <SkeletonAction />
      </SkeletonCard>
      <SkeletonTable columns={4} />
    </SkeletonPage>
  );
}

export function RenewalsSkeleton() {
  return (
    <SkeletonPage label="Loading credential renewals">
      <SkeletonTabs count={2} />
      <SkeletonCard description>
        <div className="space-y-6">
          {[0, 1].map((i) => (
            <div className="space-y-4 py-2" key={i}>
              <SkeletonBlock className="h-6 w-48" />
              <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
                {Array.from({ length: 6 }, (_, j) => (
                  <div className="space-y-2" key={j}>
                    <SkeletonBlock className="h-4 w-24" />
                    <SkeletonBlock className="h-5 w-20" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </SkeletonCard>
    </SkeletonPage>
  );
}

export function VendorsSkeleton() {
  return (
    <SkeletonPage label="Loading vendors">
      <SkeletonTabs count={4} />
      <SkeletonCard description>
        <SkeletonList rows={3} avatar />
      </SkeletonCard>
    </SkeletonPage>
  );
}

export function AuditSkeleton() {
  return (
    <SkeletonPage label="Loading audit logs">
      <SkeletonTabs count={3} />
      <SkeletonTable columns={6} pagination />
    </SkeletonPage>
  );
}

export function UsersSkeleton() {
  return (
    <SkeletonPage label="Loading administrator accounts">
      <SkeletonTabs count={2} />
      <SkeletonTable columns={6} />
    </SkeletonPage>
  );
}

export function AdminInvitesSkeleton() {
  return (
    <SkeletonPage label="Loading administrator invitations">
      <SkeletonTabs count={2} />
      <SkeletonCard header={false}>
        <SkeletonHeading />
        <SkeletonFields count={3} columns={3} />
        <SkeletonAction align="left" />
      </SkeletonCard>
      <SkeletonTable columns={5} />
    </SkeletonPage>
  );
}

export function AdminSettingsSkeleton() {
  return (
    <SkeletonPage label="Loading admin settings">
      <SkeletonCard icon description>
        <SkeletonBlock className="h-4 w-32" />
        <div className="flex items-center gap-4">
          <SkeletonBlock className="size-20" />
          <SkeletonBlock className="h-10 w-36" />
        </div>
        <div className="border-t border-border pt-5">
          <SkeletonFields count={4} />
        </div>
        <SkeletonAction />
      </SkeletonCard>
      <SkeletonCard icon description>
        <SkeletonFields count={2} />
        <SkeletonBlock className="h-4 w-full" />
        <SkeletonAction />
      </SkeletonCard>
      <SkeletonCard icon description>
        <SkeletonAction />
      </SkeletonCard>
      <SkeletonCard icon description>
        <SkeletonFacts count={3} />
        <div className="border-t border-border pt-5">
          <SkeletonFields count={2} />
        </div>
        <SkeletonBlock className="h-10 w-full" />
        <SkeletonAction />
      </SkeletonCard>
    </SkeletonPage>
  );
}

export function VerificationBillingSkeleton() {
  return (
    <SkeletonPage label="Loading verification billing settings">
      <SkeletonBack />
      <SkeletonHeading />
      <SkeletonCard icon description>
        <SkeletonFacts />
      </SkeletonCard>
      <SkeletonCard icon description>
        <SkeletonFields count={2} />
        <SkeletonAction align="left" />
        <SkeletonBlock className="h-4 w-full" />
      </SkeletonCard>
      <SkeletonCard icon description>
        <SkeletonAction align="left" />
      </SkeletonCard>
      <SkeletonTable columns={6} rows={3} />
    </SkeletonPage>
  );
}
