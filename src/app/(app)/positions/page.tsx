import { auth } from "@/lib/auth";
import { getPositionGroups } from "@/lib/db/queries";
import { PageTitle } from "@/components/ui/PagePlaceholder";
import { Card } from "@/components/ui/Card";
import {
  LivePositionsTable,
  type LivePositionGroupData,
} from "@/components/positions/LivePositionsTable";
import { daysToExpiry, formatOptionName } from "@/lib/utils/format";
import { AddOrderButton } from "@/components/orders/AddOrderButton";

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
      <div className="flex items-start justify-between gap-3">
        <PageTitle
          title="Positions"
          subtitle="Saisie manuelle ou import courtier — cours live ou différés, badge de fraîcheur par ligne"
        />
        <AddOrderButton />
      </div>

      {hasDrift && (
        <p className="mb-4 rounded-lg border border-warn/40 bg-warn/10 px-4 py-2.5 text-sm text-warn">
          Dérive détectée entre le relevé du courtier et les fills importés sur certaines
          positions — le snapshot fait foi, vérifie le détail de sync dans les
          réglages.
        </p>
      )}

      {data.length === 0 ? (
        <Card>
          <p className="py-10 text-center text-sm text-ink-mute">
            Aucune position ouverte. Ajoute ton premier ordre avec le bouton
            ci-dessus, ou connecte ta plateforme dans les réglages.
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
