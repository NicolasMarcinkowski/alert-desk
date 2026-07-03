/**
 * Formatage fr-FR des valeurs financières.
 * Convention DA : les montants s'affichent en mono tabulaire (classe CSS),
 * le signe est toujours explicite pour les P&L.
 */

const MONTHS_FR = [
  "JAN",
  "FÉV",
  "MAR",
  "AVR",
  "MAI",
  "JUN",
  "JUL",
  "AOÛ",
  "SEP",
  "OCT",
  "NOV",
  "DÉC",
];

export function formatMoney(
  value: number,
  currency: string = "EUR",
  digits = 2
): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

/** P&L : signe explicite (+/−). */
export function formatSignedMoney(value: number, currency = "EUR"): string {
  const formatted = formatMoney(Math.abs(value), currency);
  return value < 0 ? `−${formatted}` : `+${formatted}`;
}

export function formatSignedPct(value: number): string {
  const abs = Math.abs(value).toLocaleString("fr-FR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  return value < 0 ? `−${abs} %` : `+${abs} %`;
}

export function formatPct(value: number): string {
  return `${value.toLocaleString("fr-FR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} %`;
}

export function formatQty(value: number): string {
  return value.toLocaleString("fr-FR", { maximumFractionDigits: 4 });
}

export function formatPrice(value: number, currency = "USD"): string {
  return formatMoney(value, currency, value < 10 ? 4 : 2);
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeZone: "Europe/Paris",
  }).format(date);
}

export function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Paris",
  }).format(date);
}

/** `AAPL 21 NOV 25 190 C` — libellé option lisible (format maquette). */
export function formatOptionName(instr: {
  underlyingSymbol: string | null;
  expiry: Date | null;
  strike: unknown;
  putCall: "PUT" | "CALL" | null;
}): string {
  if (!instr.expiry || instr.strike == null || !instr.putCall) {
    return instr.underlyingSymbol ?? "?";
  }
  const d = instr.expiry;
  const strike = Number(instr.strike);
  const strikeStr = Number.isInteger(strike)
    ? String(strike)
    : strike.toLocaleString("fr-FR");
  return `${instr.underlyingSymbol} ${d.getUTCDate()} ${MONTHS_FR[d.getUTCMonth()]} ${String(
    d.getUTCFullYear()
  ).slice(2)} ${strikeStr} ${instr.putCall.charAt(0)}`;
}

/** Jours restants avant expiration (vs 16h America/New_York ≈ 21h/22h Paris). */
export function daysToExpiry(expiry: Date, now = new Date()): number {
  const expiryClose = new Date(expiry);
  expiryClose.setUTCHours(21, 0, 0, 0);
  return Math.max(
    0,
    Math.ceil((expiryClose.getTime() - now.getTime()) / 86_400_000)
  );
}
