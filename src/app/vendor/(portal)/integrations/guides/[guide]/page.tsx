import { notFound } from "next/navigation";
import { LegacyIntegrationRedirect } from "@/features/vendors/integrations/LegacyIntegrationRedirect";
export default async function LegacyGuidePage({ params }: { params: Promise<{ guide: string }> }) { const { guide } = await params; if (!["verification", "payments", "refunds"].includes(guide)) notFound(); return <LegacyIntegrationRedirect />; }
