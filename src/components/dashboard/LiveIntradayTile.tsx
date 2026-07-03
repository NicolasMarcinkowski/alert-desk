"use client";

import { useLiveQuotes } from "@/hooks/useLiveQuotes";
import type { LivePositionLite } from "@/lib/db/queries";
import { KpiTile } from "@/components/ui/KpiTile";
import { formatSignedMoney } from "@/lib/utils/format";

/**
 * Δ intraday du portefeuille = Σ (last − prevClose) × qty × mult × fx,
 * sur les positions dont on a une quote avec prevClose. Estimation
 * honnêtement badgée LIVE/différé — le NAV officiel reste EOD.
 */
export function LiveIntradayTile({
  positions,
  currency,
}: {
  positions: LivePositionLite[];
  currency: string;
}) {
  const { quotes } = useLiveQuotes();

  let delta: number | null = null;
  let covered = 0;
  let anyLive = false;
  for (const p of positions) {
    const quote = quotes[p.key];
    if (!quote?.prevClose) continue;
    delta =
      (delta ?? 0) +
      (quote.last - quote.prevClose) * p.quantity * p.multiplier * p.fxRateToBase;
    covered++;
    if (!quote.delayed) anyLive = true;
  }

  return (
    <KpiTile
      label="Δ Intraday"
      value={delta !== null ? formatSignedMoney(delta, currency) : "—"}
      sub={
        delta !== null
          ? `estimé sur ${covered}/${positions.length} positions`
          : "en attente de cotations"
      }
      tone={delta === null ? "neutral" : delta >= 0 ? "gain" : "loss"}
      freshness={delta !== null ? (anyLive ? "live" : "delayed") : "live"}
    />
  );
}
