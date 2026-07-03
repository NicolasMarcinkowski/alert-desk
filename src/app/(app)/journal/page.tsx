import { auth } from "@/lib/auth";
import { getJournal } from "@/lib/db/queries";
import { PageTitle } from "@/components/ui/PagePlaceholder";
import { Card } from "@/components/ui/Card";
import { KpiTile } from "@/components/ui/KpiTile";
import {
  formatDate,
  formatMoney,
  formatPct,
  formatQty,
  formatSignedMoney,
} from "@/lib/utils/format";

export const dynamic = "force-dynamic";

export default async function JournalPage() {
  const session = await auth();
  const { trips, kpis } = await getJournal(session!.user.id);
  const winRate =
    kpis.closedCount > 0 ? (kpis.winCount / kpis.closedCount) * 100 : null;

  return (
    <div>
      <PageTitle
        title="Journal de trades"
        subtitle="Round-trips reconstruits depuis les exécutions IBKR · P&L réalisé fifoPnlRealized"
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile
          label="P&L net réalisé"
          value={
            kpis.closedCount > 0
              ? formatSignedMoney(kpis.netRealizedBase)
              : "—"
          }
          sub="net de commissions, devise de base"
          tone={
            kpis.closedCount === 0
              ? "neutral"
              : kpis.netRealizedBase >= 0
                ? "gain"
                : "loss"
          }
        />
        <KpiTile
          label="Win rate"
          value={winRate !== null ? formatPct(winRate) : "—"}
          sub={`${kpis.winCount}W / ${kpis.lossCount}L · clôturés seulement`}
        />
        <KpiTile
          label="Trades clôturés"
          value={String(kpis.closedCount)}
          sub={`${trips.length - kpis.closedCount} en cours`}
        />
        <KpiTile
          label="Frais totaux"
          value={kpis.feesBase > 0 ? formatMoney(kpis.feesBase) : "—"}
          sub="commissions IBKR"
        />
      </div>

      {trips.length === 0 ? (
        <Card>
          <p className="py-10 text-center text-sm text-ink-mute">
            Aucun trade importé pour l&apos;instant. Les round-trips
            apparaîtront après la première sync IBKR.
          </p>
        </Card>
      ) : (
        <Card className="overflow-hidden" title="Round-trips">
          <div className="-m-5 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-edge text-left text-[11px] uppercase tracking-wider text-ink-mute">
                  <th className="px-5 py-2.5 font-medium">Instrument</th>
                  <th className="px-3 py-2.5 font-medium">Sens</th>
                  <th className="px-3 py-2.5 text-right font-medium">Qté max</th>
                  <th className="px-3 py-2.5 font-medium">Ouvert</th>
                  <th className="px-3 py-2.5 font-medium">Clôturé</th>
                  <th className="px-3 py-2.5 text-right font-medium">P&L réalisé</th>
                  <th className="px-3 py-2.5 text-right font-medium">Frais</th>
                  <th className="px-5 py-2.5 text-right font-medium">Résultat</th>
                </tr>
              </thead>
              <tbody>
                {trips.map((trip) => (
                  <tr key={trip.id} className="border-b border-edge-soft last:border-0">
                    <td className="px-5 py-2">
                      {trip.optionLabel ? (
                        <span className="font-mono text-[13px]">
                          {trip.optionLabel}
                        </span>
                      ) : (
                        trip.symbol
                      )}
                      <span className="ml-2 rounded border border-edge px-1 py-px text-[9px] text-ink-mute">
                        {trip.secType}
                      </span>
                      {trip.strategy && (
                        <span className="ml-2 rounded bg-accent/10 px-1.5 py-px text-[10px] text-accent">
                          {trip.strategy}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-ink-soft">
                      {trip.direction === "LONG" ? "Long" : "Short"}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      {formatQty(trip.maxQuantity)}
                    </td>
                    <td className="px-3 py-2 text-xs text-ink-soft">
                      {formatDate(trip.openedAt)}
                    </td>
                    <td className="px-3 py-2 text-xs text-ink-soft">
                      {trip.closedAt ? formatDate(trip.closedAt) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      {trip.realizedPnl !== null ? (
                        <span
                          className={
                            trip.realizedPnl >= 0 ? "text-gain" : "text-loss"
                          }
                        >
                          {formatSignedMoney(trip.realizedPnl, trip.currency)}
                          {!trip.pnlConfirmed && trip.status === "CLOSED" && (
                            <span
                              className="ml-1.5 rounded border border-warn/30 bg-warn/10 px-1 py-px text-[9px] font-semibold text-warn"
                              title="En attente de confirmation par le relevé Activity"
                            >
                              ESTIMÉ
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-ink-mute">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-ink-soft">
                      {formatMoney(trip.commissions, trip.currency)}
                    </td>
                    <td className="px-5 py-2 text-right">
                      {trip.status === "OPEN" ? (
                        <span className="rounded border border-accent/30 bg-accent/10 px-1.5 py-px text-[9px] font-semibold text-accent">
                          EN COURS
                        </span>
                      ) : (trip.realizedPnl ?? 0) > 0 ? (
                        <span className="rounded border border-gain/30 bg-gain/10 px-1.5 py-px text-[9px] font-semibold text-gain">
                          WIN
                        </span>
                      ) : (
                        <span className="rounded border border-loss/30 bg-loss/10 px-1.5 py-px text-[9px] font-semibold text-loss">
                          LOSS
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
