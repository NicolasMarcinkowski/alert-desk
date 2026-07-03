/**
 * Les horodatages Flex ("yyyyMMdd;HHmmss") sont exprimés dans le fuseau
 * configuré sur le compte IBKR, SANS offset. On convertit en UTC ici,
 * une seule fois, au parsing.
 */

export const DEFAULT_ACCOUNT_TIMEZONE = "America/New_York";

/** Offset (ms) du fuseau `timeZone` au moment `utcDate`. */
function tzOffsetMs(utcDate: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(utcDate)) {
    parts[p.type] = p.value;
  }
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return asUtc - utcDate.getTime();
}

/** Interprète une heure locale du fuseau donné et retourne l'instant UTC. */
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute, second);
  const offset = tzOffsetMs(new Date(guess), timeZone);
  let utc = guess - offset;
  // Deuxième passe pour les bascules DST
  const offset2 = tzOffsetMs(new Date(utc), timeZone);
  if (offset2 !== offset) {
    utc = guess - offset2;
  }
  return new Date(utc);
}

/** "20260702" | "2026-07-02" → "2026-07-02" (ou undefined). */
export function normalizeFlexDate(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  return undefined;
}

/**
 * "20260702;093015" (ou variantes " " / ",") dans le fuseau du compte → Date UTC.
 * Sans composante horaire, on prend 12:00 locale (milieu de séance).
 */
export function parseFlexDateTime(
  raw: string | undefined,
  timeZone: string
): Date | undefined {
  if (!raw) return undefined;
  const s = raw.trim().replace(/[T,]/g, ";").replace(" ", ";");
  const [datePart, timePart] = s.split(";");
  const date = normalizeFlexDate(datePart);
  if (!date) return undefined;
  const [y, mo, d] = date.split("-").map(Number);
  let h = 12,
    mi = 0,
    se = 0;
  if (timePart && /^\d{6}$/.test(timePart)) {
    h = Number(timePart.slice(0, 2));
    mi = Number(timePart.slice(2, 4));
    se = Number(timePart.slice(4, 6));
  } else if (timePart && /^\d{2}:\d{2}:\d{2}$/.test(timePart)) {
    [h, mi, se] = timePart.split(":").map(Number);
  }
  return zonedTimeToUtc(y, mo, d, h, mi, se, timeZone);
}
