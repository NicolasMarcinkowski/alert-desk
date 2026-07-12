/**
 * Badge de fraîcheur des données — concept central de l'app :
 * chaque valeur de marché affiche honnêtement sa latence.
 */
export type Freshness = "live" | "delayed" | "eod" | "stale";

const CONFIG: Record<Freshness, { label: string; className: string }> = {
  live: { label: "LIVE", className: "text-gain border-gain/30 bg-gain/10" },
  delayed: {
    label: "~15 MIN",
    className: "text-warn border-warn/30 bg-warn/10",
  },
  eod: {
    label: "EOD",
    className: "text-ink-soft border-edge bg-surface-2",
  },
  // Flux SSE coupé : les cours affichés sont figés (plus aucune mise à jour)
  stale: {
    label: "FIGÉ",
    className: "text-ink-mute border-edge bg-surface-2",
  },
};

/**
 * Un cours plus vieux que ce seuil est considéré figé, même si la connexion
 * SSE est vivante : marché fermé, week-end, ou symbole qui ne tick plus.
 * (Au-delà du différé Yahoo ~15 min pour ne pas dégrader ses cotations.)
 */
const QUOTE_STALE_MS = 30 * 60 * 1000;

export function isQuoteStale(ts: number): boolean {
  return Date.now() - ts > QUOTE_STALE_MS;
}

/**
 * Fraîcheur honnête d'une valeur de marché : `stale` (FIGÉ) si le flux SSE
 * est coupé OU si le cours n'a pas bougé depuis trop longtemps ; sinon le
 * flag `delayed` du fournisseur. Sans quote : EOD si un mark de clôture
 * existe, rien sinon.
 */
export function marketFreshness(
  quote: { delayed: boolean; ts: number } | undefined,
  hasEod: boolean,
  connected: boolean
): Freshness | null {
  if (!quote) return hasEod ? "eod" : null;
  if (!connected || isQuoteStale(quote.ts)) return "stale";
  return quote.delayed ? "delayed" : "live";
}

export function FreshnessBadge({ kind }: { kind: Freshness }) {
  const { label, className } = CONFIG[kind];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-px font-mono text-[9px] font-semibold tracking-wider ${className}`}
    >
      {kind === "live" && (
        <span
          className="size-1 rounded-full bg-gain"
          style={{ animation: "pulse-dot 1.6s ease-in-out infinite" }}
        />
      )}
      {label}
    </span>
  );
}
