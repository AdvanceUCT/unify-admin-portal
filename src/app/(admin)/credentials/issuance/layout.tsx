import { IssuanceTabs } from "@/features/credentials/IssuanceTabs";

export default function IssuanceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-6">
      <IssuanceTabs />
      {children}
    </div>
  );
}
