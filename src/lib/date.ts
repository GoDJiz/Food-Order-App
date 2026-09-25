const BUSINESS_TZ = "Asia/Bangkok";

/**
 * Returns the current business date (YYYY-MM-DD) in Asia/Bangkok,
 * regardless of the server's own timezone.
 */
export function currentBusinessDate(now: Date = new Date()): string {
  return formatBusinessDate(now);
}

/**
 * Formats any Date as its Asia/Bangkok calendar date (YYYY-MM-DD).
 */
export function formatBusinessDate(date: Date): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  // en-CA locale formats as YYYY-MM-DD
  return formatter.format(date);
}

/**
 * Converts a business date (YYYY-MM-DD) into the YYMMDD token used in
 * order numbers, e.g. "2026-09-16" -> "260916".
 */
export function businessDateToOrderPrefix(businessDate: string): string {
  const [yyyy, mm, dd] = businessDate.split("-");
  return `${yyyy.slice(2)}${mm}${dd}`;
}

/**
 * Builds the full order number string, e.g. ("2026-09-16", 1) -> "#260916-0001".
 */
export function formatOrderNumber(businessDate: string, seq: number): string {
  const prefix = businessDateToOrderPrefix(businessDate);
  const seqStr = String(seq).padStart(4, "0");
  return `#${prefix}-${seqStr}`;
}

/**
 * Validates that a string looks like a well-formed order number, e.g. "#260916-0001".
 */
export function isValidOrderNumberFormat(value: string): boolean {
  return /^#\d{6}-\d{4}$/.test(value);
}
