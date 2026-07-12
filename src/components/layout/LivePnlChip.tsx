"use client";

import { useLiveQuotes } from "@/hooks/useLiveQuotes";
import type { LivePositionLite } from "@/lib/db/queries";
import {
  FreshnessBadge,
  isQuoteStale,
  type Freshness,
} from "@/components/ui/FreshnessBadge";
import { formatSignedMoney } from "@/lib/utils/format";

/**
 * Chip du header : « Réalisé jour | Latent » — les deux valeurs ne
 * fusionnent JAMAIS (principe DA n°1). Le latent est recalculé en direct
 * sur les ticks SSE.
 */
export function LivePnlChip({
  realizedToday,
  executionsToday,
  positions,
  currency,
}: {
  realizedToday: number;
  executionsToday: number;
  positions: LivePositionLite[];
  currency: string;
}) {
  const { quotes, connected } = useLiveQuotes();

  let latent: number | null = null;
  let anyLive = false;
  let anyRecent = false;
  for (const p of positions) {
    const quote = quotes[p.key];
    if (!quote) continue;
    latent =
      (latent ?? 0) +
      (quote.last - p.avgCost) * p.quantity * p.multiplier * p.fxRateToBase;
    const recent = !isQuoteStale(quote.ts);
    if (recent) anyRecent = true;
    if (recent && !quote.delayed) anyLive = true;
  }
  // Figé si SSE coupé ou aucune cotation récente (marché fermé / week-end)
  const freshness: Freshness | null =
    latent === null
      ? null
      : !connected || !anyRecent
        ? "stale"
        : anyLive
          ? "live"
          : "delayed";

  const pnlClass = (v: number) => (v >= 0 ? "text-gain" : "text-loss");

  return (
    <div className="flex items-center gap-3 rounded-lg border border-edge bg-surface px-3 py-1.5 text-xs">
      <span className="text-ink-mute">Réalisé jour</span>
      <span
        className={`font-mono tabular-nums ${
          executionsToday > 0 ? pnlClass(realizedToday) : "text-ink-soft"
        }`}
      >
        {executionsToday > 0 ? formatSignedMoney(realizedToday, currency) : "—"}
      </span>
      <span className="h-3 w-px bg-edge" />
      <span className="text-ink-mute">Latent</span>
      <span
        className={`font-mono tabular-nums ${
          latent !== null ? pnlClass(latent) : "text-ink-soft"
        }`}
      >
        {latent !== null ? formatSignedMoney(latent, currency) : "—"}
      </span>
      {freshness && <FreshnessBadge kind={freshness} />}
    </div>
  );
}
