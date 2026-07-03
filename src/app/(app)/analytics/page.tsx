import Link from "next/link";
import { auth } from "@/lib/auth";
import {
  getAnalytics,
  PERIODS,
  type AnalyticsPeriod,
} from "@/lib/db/analytics";
import { PageTitle } from "@/components/ui/PagePlaceholder";
import { Card } from "@/components/ui/Card";
import { KpiTile } from "@/components/ui/KpiTile";
import { EquityDrawdown } from "@/components/analytics/EquityDrawdown";
import { PnlHeatmap } from "@/components/analytics/PnlHeatmap";
import { BarList } from "@/components/analytics/BarList";
import {
  formatMoney,
  formatPct,
  formatSignedMoney,
} from "@/lib/utils/format";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const session = await auth();
  const { period: periodParam } = await searchParams;
  const period = (
    PERIODS.some((p) => p.key === periodParam) ? periodParam : "all"
  ) as AnalyticsPeriod;

  const data = await getAnalytics(session!.user.id, period);
  const { kpis } = data;
  const ccy = data.baseCurrency;
  const has = kpis.tradeCount > 0;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <PageTitle
          title="Analytics"
          subtitle={`Calculé sur ${kpis.tradeCount} trade${kpis.tradeCount > 1 ? "s" : ""} clôturé${kpis.tradeCount > 1 ? "s" : ""} uniquement · net de frais · sans ratio de Sharpe`}
        />
        <div className="mb-5 flex gap-1 rounded-lg border border-edge bg-surface p-1">
          {PERIODS.map((p) => (
            <Link
              key={p.key}
              href={`/analytics?period=${p.key}`}
              className={`rounded-md px-3 py-1 text-xs font-medium ${
                period === p.key
                  ? "bg-accent/15 text-accent"
                  : "text-ink-soft hover:text-ink"
              }`}
            >
              {p.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-8">
        <KpiTile
          label="P&L net réalisé"
          value={has ? formatSignedMoney(kpis.netRealized, ccy) : "—"}
          tone={!has ? "neutral" : kpis.netRealized >= 0 ? "gain" : "loss"}
        />
        <KpiTile
          label="Win rate"
          value={kpis.winRate !== null ? formatPct(kpis.winRate) : "—"}
          sub={`${kpis.winCount}W / ${kpis.lossCount}L`}
        />
        <KpiTile
          label="Profit factor"
          value={
            !has
              ? "—"
              : kpis.profitFactor !== null
                ? kpis.profitFactor.toFixed(2)
                : "∞"
          }
          sub={kpis.hasLosses ? "gains bruts / pertes brutes" : "aucune perte"}
        />
        <KpiTile
          label="Expectancy"
          value={
            kpis.expectancy !== null
              ? formatSignedMoney(kpis.expectancy, ccy)
              : "—"
          }
          sub="par trade"
          tone={
            kpis.expectancy === null
              ? "neutral"
              : kpis.expectancy >= 0
                ? "gain"
                : "loss"
          }
        />
        <KpiTile
          label="Gain moyen"
          value={kpis.avgWin !== null ? formatSignedMoney(kpis.avgWin, ccy) : "—"}
          tone={kpis.avgWin !== null ? "gain" : "neutral"}
        />
        <KpiTile
          label="Perte moyenne"
          value={
            kpis.avgLoss !== null ? formatSignedMoney(kpis.avgLoss, ccy) : "—"
          }
          tone={kpis.avgLoss !== null ? "loss" : "neutral"}
        />
        <KpiTile
          label="Max drawdown"
          value={
            kpis.maxDrawdown !== null
              ? `−${formatMoney(kpis.maxDrawdown, ccy, 0)}`
              : "—"
          }
          sub={
            kpis.maxDrawdownPct !== null
              ? `${formatPct(kpis.maxDrawdownPct)} depuis le pic`
              : "NAV ajusté des flux"
          }
          tone={kpis.maxDrawdown !== null && kpis.maxDrawdown > 0 ? "loss" : "neutral"}
        />
        <KpiTile
          label="Frais"
          value={has ? formatMoney(kpis.fees, ccy) : "—"}
          sub="commissions IBKR"
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card
          title="Courbe d'equity · NAV + drawdown"
          subtitle="Ajustée des dépôts/retraits — zone rouge = drawdown depuis le pic"
        >
          <EquityDrawdown points={data.equity} currency={ccy} />
        </Card>
        <Card title="P&L quotidien — Heatmap" subtitle="Réalisé net par jour de trade">
          <PnlHeatmap dailyPnl={data.dailyPnl} currency={ccy} />
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="P&L net par sous-jacent">
          <BarList items={data.byUnderlying} currency={ccy} />
        </Card>
        <Card title="P&L net par stratégie" subtitle="Renseigne la stratégie dans le détail d'un trade (Journal)">
          <BarList items={data.byStrategy} currency={ccy} />
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Actions vs options">
          <BarList items={data.bySecType} currency={ccy} />
        </Card>
        <Card title="Long vs short">
          <BarList items={data.byDirection} currency={ccy} />
        </Card>
      </div>
    </div>
  );
}
