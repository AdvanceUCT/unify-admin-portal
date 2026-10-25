/** User-facing South African time. Wire timestamps and stored dates stay UTC. */
export const PORTAL_TIME_ZONE = "Africa/Johannesburg";
const timestamp = new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium", timeStyle: "short", timeZone: PORTAL_TIME_ZONE, hourCycle: "h23" });
const calendar = new Intl.DateTimeFormat("en-CA", { timeZone: PORTAL_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });
export function formatSastDateTime(value: string | Date) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? timestamp.format(date) : "Not set";
}
export function sastDateKey(value: string | Date = new Date()) {
  const parts = calendar.formatToParts(new Date(value));
  return ["year", "month", "day"].map(type => parts.find(part => part.type === type)!.value).join("-");
}
export function formatSastDate(value: string | Date) {
  return new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium", timeZone: PORTAL_TIME_ZONE }).format(new Date(value));
}
/**
 * Render the same instant with an explicit South African +02:00 offset for exports.
 * Shift the display components before replacing Z; stored/API timestamps remain UTC.
 */
export function sastIsoTimestamp(value: string | Date) {
  const time = new Date(value).getTime();
  return new Date(time + 2 * 60 * 60 * 1000).toISOString().replace("Z", "+02:00");
}
/**
 * Interpret a date-only filter as a South African calendar day, independent of the host timezone.
 * Return its UTC start, or the next day's exclusive boundary for an end-date filter.
 */
export function sastDayBoundary(value: string | undefined, nextDay = false): Date | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const utc = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(utc.getTime()) || utc.toISOString().slice(0, 10) !== value) return undefined;
  return new Date(utc.getTime() - 2 * 60 * 60 * 1000 + (nextDay ? 24 * 60 * 60 * 1000 : 0));
}
/**
 * Treat datetime-local form values as South African wall-clock time and return the corresponding UTC instant.
 * Validate calendar and clock fields instead of letting the browser's timezone choose the interpretation.
 */
export function sastInputToUtc(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value)) throw new Error("Enter a valid South African date and time.");
  const day = sastDayBoundary(value.slice(0, 10));
  const [hours, minutes, seconds = 0] = value.slice(11).split(":").map(Number);
  if (!day || hours > 23 || minutes > 59 || seconds > 59) throw new Error("Enter a valid South African date and time.");
  return new Date(day.getTime() + ((hours * 60 + minutes) * 60 + seconds) * 1000).toISOString();
}
