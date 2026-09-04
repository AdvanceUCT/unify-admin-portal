export function addCalendarMonthsClamped(value: Date, months: number) {
  const result = new Date(value);
  const originalDay = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(originalDay, lastDay));
  return result;
}

export function nextRenewalAt(issuedAt: Date, cadenceMonths: number) {
  return addCalendarMonthsClamped(issuedAt, cadenceMonths);
}

export function renewalCandidateCutoff(now: Date, cadenceMonths: number) {
  const targetMonth = addCalendarMonthsClamped(now, -cadenceMonths);
  return new Date(Date.UTC(targetMonth.getUTCFullYear(), targetMonth.getUTCMonth() + 1, 1) - 1);
}
