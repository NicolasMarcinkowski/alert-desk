import { auth } from "@/lib/auth";
import { getPositionGroups } from "@/lib/db/queries";
import { PageTitle } from "@/components/ui/PagePlaceholder";
import { Card } from "@/components/ui/Card";
import {
  LivePositionsTable,
  type LivePositionGroupData,
} from "@/components/positions/LivePositionsTable";
import { daysToExpiry, formatOptionName } from "@/lib/utils/format";

export const dynamic = "force-dynamic";

export default async function PositionsPage() {
  const session = await auth();
  const groups = await getPositionGroups(session!.user.id);
  const hasDrift = groups.some((g) => g.rows.some((r) => r.driftDetected));

  const data: LivePositionGroupData[] = groups.map((group) => ({
    underlying: group.underlying,
    rows: group.rows.map((row) => ({
      id: row.id,
      key: row.secType === "OPT" ? (row.occSymbol ?? row.symbol) : row.symbol,
      display: row.secType === "OPT" ? formatOptionName(row) : row.symbol,
      secType: row.secType,
      quantity: row.quantity,
      avgCost: row.avgCost,
      currency: row.currency,
      multiplier: row.multiplier,
      fxRateToBase: row.fxRateToBase,
      state: row.state,
      eodMark: row.markPrice,
      dte: row.expiry ? daysToExpiry(row.expiry) : null,
    })),
  }));

  return (
    <div>
      <PageTitle
        title="Positions"
        subtitle="Import automatique IBKR Flex — cours live (Finnhub) ou différés, badge de fraîcheur par ligne"
      />

      {hasDrift && (
        <p className="mb-4 rounded-lg border border-warn/40 bg-warn/10 px-4 py-2.5 text-sm text-warn">
          Dérive détectée entre snapshot IBKR et fills importés sur certaines
          positions — le snapshot fait foi, vérifie le détail de sync dans les
          réglages.
        </p>
      )}

      {data.length === 0 ? (
        <Card>
          <p className="py-10 text-center text-sm text-ink-mute">
            Aucune position ouverte importée. Relie un compte IBKR dans les
            réglages puis lance une sync.
          </p>
        </Card>
      ) : (
        <Card className="overflow-hidden" title="Positions ouvertes">
          <LivePositionsTable groups={data} baseCurrency="EUR" />
        </Card>
      )}
    </div>
  );
}
