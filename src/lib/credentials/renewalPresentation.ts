const dateFormatter = new Intl.DateTimeFormat("en-ZA", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Africa/Johannesburg",
});

/** Expiry is stored exclusively; present the last day that remains valid. */
export function formatRenewalDate(
  value: string | Date,
  expiryBoundary = false,
) {
  const date = new Date(new Date(value).getTime() - (expiryBoundary ? 1 : 0));
  return Number.isNaN(date.getTime()) ? "Not set" : dateFormatter.format(date);
}

export function renewalStatusLabel(status: string) {
  if (status === "DEFERRED") return "Suspended";
  if (status === "NEEDS_ATTENTION") return "Needs attention";
  return status
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (char) => char.toUpperCase());
}
