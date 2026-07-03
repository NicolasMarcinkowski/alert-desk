"use client";

import { useLiveQuotes } from "@/hooks/useLiveQuotes";
import { FreshnessBadge, type Freshness } from "@/components/ui/FreshnessBadge";
import {
  formatPrice,
  formatQty,
  formatSignedMoney,
  formatSignedPct,
} from "@/lib/utils/format";

export interface LivePositionRowData {
  id: string;
  /** Clé du cache de quotes (ticker ou OCC compact) */
  key: string;
  display: string;
  secType: string;
  quantity: number;
  avgCost: number;
  currency: string;
  multiplier: number;
  fxRateToBase: number;
  state: "SNAPSHOT_CONFIRMED" | "INTRADAY_ESTIMATED";
  eodMark: number | null;
  dte: number | null;
}

export interface LivePositionGroupData {
  underlying: string;
  rows: LivePositionRowData[];
}

function Pnl({ value, currency }: { value: number | null; currency: string }) {
  if (value === null) return <span className="text-ink-mute">—</span>;
  return (
    <span className={value >= 0 ? "text-gain" : "text-loss"}>
      {formatSignedMoney(value, currency)}
    </span>
  );
}

export function LivePositionsTable({
  groups,
  baseCurrency,
}: {
  groups: LivePositionGroupData[];
  baseCurrency: string;
}) {
  const { quotes } = useLiveQuotes();

  const computed = groups.map((group) => {
    const rows = group.rows.map((row) => {
      const quote = quotes[row.key];
      const mark = quote?.last ?? row.eodMark;
      const freshness: Freshness | null = quote
        ? quote.delayed
          ? "delayed"
          : "live"
        : row.eodMark !== null
          ? "eod"
          : null;
      const latent =
        mark !== null
          ? (mark - row.avgCost) * row.quantity * row.multiplier
          : null;
      const latentPct =
        mark !== null && row.avgCost !== 0
          ? ((mark - row.avgCost) / Math.abs(row.avgCost)) *
            100 *
            Math.sign(row.quantity)
          : null;
      return { ...row, mark, freshness, latent, latentPct };
    });
    const withLatent = rows.filter((r) => r.latent !== null);
    return {
      underlying: group.underlying,
      rows,
      totalBase:
        withLatent.length > 0
          ? withLatent.reduce(
              (sum, r) => sum + (r.latent ?? 0) * r.fxRateToBase,
              0
            )
          : null,
    };
  });

  const grandTotal = computed.reduce(
    (sum, g) => sum + (g.totalBase ?? 0),
    0
  );

  return (
    <div className="-m-5 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-edge text-left text-[11px] uppercase tracking-wider text-ink-mute">
            <th className="px-5 py-2.5 font-medium">Instrument</th>
            <th className="px-3 py-2.5 text-right font-medium">Qté</th>
            <th className="px-3 py-2.5 text-right font-medium">PRU</th>
            <th className="px-3 py-2.5 text-right font-medium">Cours</th>
            <th className="px-3 py-2.5 text-right font-medium">P&L latent</th>
            <th className="px-3 py-2.5 text-right font-medium">P&L %</th>
            <th className="px-3 py-2.5 text-right font-medium">DTE</th>
            <th className="px-5 py-2.5 text-right font-medium">État</th>
          </tr>
        </thead>
        <tbody>
          {computed.map((group) => (
            <>
              <tr
                key={group.underlying}
                className="border-b border-edge-soft bg-surface-2/40"
              >
                <td className="px-5 py-2 font-semibold">
                  {group.underlying}
                  <span className="ml-2 text-xs font-normal text-ink-mute">
                    {group.rows.length} position
                    {group.rows.length > 1 ? "s" : ""}
                  </span>
                </td>
                <td colSpan={3} />
                <td className="px-3 py-2 text-right font-mono tabular-nums">
                  <Pnl value={group.totalBase} currency={baseCurrency} />
                </td>
                <td colSpan={3} />
              </tr>
              {group.rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-edge-soft last:border-0"
                >
                  <td className="px-5 py-2 pl-8">
                    {row.secType === "OPT" ? (
                      <span className="font-mono text-[13px]">{row.display}</span>
                    ) : (
                      <span>{row.display}</span>
                    )}
                    <span className="ml-2 rounded border border-edge px-1 py-px text-[9px] text-ink-mute">
                      {row.secType}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    {formatQty(row.quantity)}
                    {row.secType === "OPT" && (
                      <span className="text-ink-mute"> ×{row.multiplier}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    {formatPrice(row.avgCost, row.currency)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    {row.mark !== null ? (
                      <span className="inline-flex items-center gap-1.5">
                        {formatPrice(row.mark, row.currency)}
                        {row.freshness && <FreshnessBadge kind={row.freshness} />}
                      </span>
                    ) : (
                      <span className="text-ink-mute">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    <Pnl value={row.latent} currency={row.currency} />
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    {row.latentPct !== null ? (
                      <span className={row.latentPct >= 0 ? "text-gain" : "text-loss"}>
                        {formatSignedPct(row.latentPct)}
                      </span>
                    ) : (
                      <span className="text-ink-mute">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    {row.dte !== null ? (
                      <span className={row.dte <= 7 ? "text-warn" : undefined}>
                        {row.dte} j
                      </span>
                    ) : (
                      <span className="text-ink-mute">—</span>
                    )}
                  </td>
                  <td className="px-5 py-2 text-right">
                    {row.state === "INTRADAY_ESTIMATED" ? (
                      <span className="rounded border border-warn/30 bg-warn/10 px-1.5 py-px text-[9px] font-semibold text-warn">
                        ESTIMÉ
                      </span>
                    ) : (
                      <span className="rounded border border-edge px-1.5 py-px text-[9px] text-ink-mute">
                        CONFIRMÉ
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-edge bg-surface-2/60">
            <td className="px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-ink-mute">
              Total latent (base)
            </td>
            <td colSpan={3} />
            <td className="px-3 py-2.5 text-right font-mono font-semibold tabular-nums">
              <Pnl value={grandTotal} currency={baseCurrency} />
            </td>
            <td colSpan={3} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
