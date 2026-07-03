import { auth } from "@/lib/auth";
import { getPositionGroups } from "@/lib/db/queries";
import { PageTitle } from "@/components/ui/PagePlaceholder";
import { Card } from "@/components/ui/Card";
import { FreshnessBadge } from "@/components/ui/FreshnessBadge";
import {
  daysToExpiry,
  formatOptionName,
  formatPrice,
  formatQty,
  formatSignedMoney,
} from "@/lib/utils/format";

export const dynamic = "force-dynamic";

function PnlCell({ value, currency }: { value: number | null; currency: string }) {
  if (value === null) {
    return <span className="text-ink-mute">—</span>;
  }
  return (
    <span className={value >= 0 ? "text-gain" : "text-loss"}>
      {formatSignedMoney(value, currency)}
    </span>
  );
}

export default async function PositionsPage() {
  const session = await auth();
  const groups = await getPositionGroups(session!.user.id);
  const hasDrift = groups.some((g) => g.rows.some((r) => r.driftDetected));
  const totalBase = groups.reduce(
    (sum, g) => sum + (g.totalUnrealizedBase ?? 0),
    0
  );

  return (
    <div>
      <PageTitle
        title="Positions"
        subtitle="Import automatique IBKR Flex — groupées par sous-jacent · marks EOD (live au jalon M2)"
      />

      {hasDrift && (
        <p className="mb-4 rounded-lg border border-warn/40 bg-warn/10 px-4 py-2.5 text-sm text-warn">
          Dérive détectée entre snapshot IBKR et fills importés sur certaines
          positions — le snapshot fait foi, vérifie le détail de sync dans les
          réglages.
        </p>
      )}

      {groups.length === 0 ? (
        <Card>
          <p className="py-10 text-center text-sm text-ink-mute">
            Aucune position ouverte importée. Relie un compte IBKR dans les
            réglages puis lance une sync.
          </p>
        </Card>
      ) : (
        <Card className="overflow-hidden" title="Positions ouvertes">
          <div className="-m-5 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-edge text-left text-[11px] uppercase tracking-wider text-ink-mute">
                  <th className="px-5 py-2.5 font-medium">Instrument</th>
                  <th className="px-3 py-2.5 text-right font-medium">Qté</th>
                  <th className="px-3 py-2.5 text-right font-medium">PRU</th>
                  <th className="px-3 py-2.5 text-right font-medium">
                    Cours (EOD)
                  </th>
                  <th className="px-3 py-2.5 text-right font-medium">
                    P&L latent
                  </th>
                  <th className="px-3 py-2.5 text-right font-medium">DTE</th>
                  <th className="px-5 py-2.5 text-right font-medium">État</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => (
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
                        <PnlCell value={group.totalUnrealizedBase} currency="EUR" />
                      </td>
                      <td colSpan={2} />
                    </tr>
                    {group.rows.map((row) => (
                      <tr
                        key={row.id}
                        className="border-b border-edge-soft last:border-0"
                      >
                        <td className="px-5 py-2 pl-8">
                          {row.secType === "OPT" ? (
                            <span className="font-mono text-[13px]">
                              {formatOptionName(row)}
                            </span>
                          ) : (
                            <span>{row.symbol}</span>
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
                          {row.markPrice !== null ? (
                            <span className="inline-flex items-center gap-1.5">
                              {formatPrice(row.markPrice, row.currency)}
                              <FreshnessBadge kind="eod" />
                            </span>
                          ) : (
                            <span className="text-ink-mute">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">
                          <PnlCell
                            value={row.unrealizedPnl}
                            currency={row.currency}
                          />
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">
                          {row.expiry ? (
                            <span
                              className={
                                daysToExpiry(row.expiry) <= 7
                                  ? "text-warn"
                                  : undefined
                              }
                            >
                              {daysToExpiry(row.expiry)} j
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
                    <PnlCell value={totalBase} currency="EUR" />
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
