import { auth } from "@/lib/auth";
import { getJournal } from "@/lib/db/queries";
import { PageTitle } from "@/components/ui/PagePlaceholder";
import { Card } from "@/components/ui/Card";
import { KpiTile } from "@/components/ui/KpiTile";
import {
  JournalTable,
  type JournalTripView,
} from "@/components/journal/JournalTable";
import { formatMoney, formatPct, formatSignedMoney } from "@/lib/utils/format";
import { AddOrderButton } from "@/components/orders/AddOrderButton";

export const dynamic = "force-dynamic";

export default async function JournalPage() {
  const session = await auth();
  const { trips, kpis } = await getJournal(session!.user.id);
  const winRate =
    kpis.closedCount > 0 ? (kpis.winCount / kpis.closedCount) * 100 : null;

  const tripViews: JournalTripView[] = trips.map((t) => ({
    id: t.id,
    symbol: t.symbol,
    optionLabel: t.optionLabel,
    secType: t.secType,
    direction: t.direction,
    status: t.status,
    openedAt: t.openedAt.toISOString(),
    closedAt: t.closedAt?.toISOString() ?? null,
    maxQuantity: t.maxQuantity,
    realizedPnl: t.realizedPnl,
    currency: t.currency,
    commissions: t.commissions,
    pnlConfirmed: t.pnlConfirmed,
    strategy: t.strategy,
    tags: t.tags,
    rating: t.rating,
  }));

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <PageTitle
          title="Journal de trades"
          subtitle="Round-trips reconstruits depuis tes exécutions — clique sur un trade pour le détail et les annotations"
        />
        <AddOrderButton />
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile
          label="P&L net réalisé"
          value={
            kpis.closedCount > 0 ? formatSignedMoney(kpis.netRealizedBase) : "—"
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
            Aucun trade pour l&apos;instant. Ajoute ton premier ordre avec le
            bouton ci-dessus, ou relie un compte IBKR dans les réglages.
          </p>
        </Card>
      ) : (
        <JournalTable trips={tripViews} />
      )}
    </div>
  );
}
