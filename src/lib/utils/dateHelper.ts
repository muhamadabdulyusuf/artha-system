const OUTLET_TIMEZONE = "Asia/Jakarta";

/** Jam 00:00–04:59 → tanggal kalender dikurangi 1 hari (cutoff operasional 05:00). */
export function resolveBusinessDate(now: Date = new Date()): string {
  const hour = getHourInTimeZone(now, OUTLET_TIMEZONE);
  const calendarDate = formatDateIso(now, OUTLET_TIMEZONE);

  if (hour < 5) {
    return addDaysToIsoDate(calendarDate, -1);
  }
  return calendarDate;
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

function getHourInTimeZone(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    hour12: false,
  }).formatToParts(date);
  const hourPart = parts.find((p) => p.type === "hour");
  return hourPart ? parseInt(hourPart.value, 10) : 0;
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

function addDaysToIsoDate(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + days, 12, 0, 0));
  return next.toISOString().slice(0, 10);
}
