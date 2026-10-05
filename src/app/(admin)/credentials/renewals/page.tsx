import { redirect } from "next/navigation";

export default async function LegacyRenewalsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string") params.set(key, value);
    else if (Array.isArray(value))
      value.forEach((item) => params.append(key, item));
  }
  redirect(`/credentials/issuance/renewals${params.size ? `?${params}` : ""}`);
}
