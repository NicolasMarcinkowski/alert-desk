import { Card } from "@/components/ui/Card";
import { KpiTile } from "@/components/ui/KpiTile";
import { PageTitle } from "@/components/ui/PagePlaceholder";

export default function DashboardPage() {
  return (
    <div>
      <PageTitle
        title="Dashboard"
        subtitle="Vue d'ensemble — NAV, P&L du jour, échéances et activité récente"
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <KpiTile label="NAV" value="—" sub="hier clôture" freshness="eod" />
        <KpiTile
          label="Δ Intraday"
          value="—"
          sub="estimé sur positions"
          freshness="live"
        />
        <KpiTile label="Réalisé jour" value="—" sub="0 round-trip" />
        <KpiTile label="Réalisé MTD" value="—" sub="0 trade clôturé" />
        <KpiTile label="Win rate" value="—" sub="trades clôturés seulement" />
        <KpiTile label="Frais MTD" value="—" sub="commissions IBKR" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card
          title="Courbe d'equity — NAV"
          subtitle="Snapshot quotidien IBKR (Activity Flex)"
          className="lg:col-span-2"
        >
          <p className="py-12 text-center text-sm text-ink-mute">
            Disponible après le premier import IBKR (jalon M1).
          </p>
        </Card>
        <Card title="Échéances ≤ 7 j" subtitle="Options du portefeuille">
          <p className="py-12 text-center text-sm text-ink-mute">
            Aucune donnée — connecte un compte IBKR dans les réglages.
          </p>
        </Card>
      </div>
    </div>
  );
}
