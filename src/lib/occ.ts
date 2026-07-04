/**
 * Symbole OCC compact (format des fournisseurs de quotes, ex. Yahoo) :
 * AAPL260721C00190000 — unique implémentation, utilisée par l'import Flex
 * et la saisie manuelle.
 */
export function buildOccSymbol(
  underlyingSymbol: string,
  /** yyyy-mm-dd */
  expiry: string,
  strike: number | string,
  putCall: "PUT" | "CALL"
): string {
  const [y, m, d] = expiry.split("-");
  const strikeThousandths = Math.round(Number(strike) * 1000)
    .toString()
    .padStart(8, "0");
  return `${underlyingSymbol}${y.slice(2)}${m}${d}${putCall.charAt(0)}${strikeThousandths}`;
}
