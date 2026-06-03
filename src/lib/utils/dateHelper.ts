const OUTLET_TIMEZONE = "Asia/Jakarta";

/** Business date mengikuti tanggal kalender outlet. */
export function resolveBusinessDate(now: Date = new Date()): string {
  return formatDateIso(now, OUTLET_TIMEZONE);
}

export function formatBusinessDateLabel(isoDate: string, locale = "en-GB"): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/** YYYY-MM-DD dalam timezone outlet */
function formatDateIso(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
