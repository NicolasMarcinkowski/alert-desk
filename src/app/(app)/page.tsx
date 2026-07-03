import Link from "next/link";
import { auth } from "@/lib/auth";
import { getDashboard, getHeaderStats } from "@/lib/db/queries";
import { LiveIntradayTile } from "@/components/dashboard/LiveIntradayTile";
import { Card } from "@/components/ui/Card";
import { KpiTile } from "@/components/ui/KpiTile";
import { EquityCurve } from "@/components/ui/EquityCurve";
import { PageTitle } from "@/components/ui/PagePlaceholder";
import {
  formatDate,
  formatDateTime,
  formatMoney,
  formatPct,
  formatPrice,
  formatQty,
  formatSignedMoney,
} from "@/lib/utils/format";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await auth();
  const [data, headerStats] = await Promise.all([
    getDashboard(session!.user.id),
    getHeaderStats(session!.user.id),
  ]);
  const ccy = data.baseCurrency;

  return (
    <div>
      <PageTitle
        title="Dashboard"
        subtitle="Vue d'ensemble — NAV, P&L du jour, échéances et activité récente"
      />

      {!data.hasAccounts && (
        <p className="mb-4 rounded-lg border border-accent/30 bg-accent/10 px-4 py-2.5 text-sm">
          Aucun compte IBKR relié —{" "}
          <Link href="/reglages" className="font-medium text-accent underline">
            configure ton token Flex dans les réglages
          </Link>{" "}
          pour importer tes ordres.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <KpiTile
          label="NAV"
          value={data.nav !== null ? formatMoney(data.nav, ccy, 0) : "—"}
          sub={data.navDate ? `clôture ${formatDate(data.navDate)}` : "aucun snapshot"}
          freshness="eod"
        />
        <LiveIntradayTile positions={headerStats.positions} currency={ccy} />
        <KpiTile
          label="Réalisé jour"
          value={
            data.todayExecutionCount > 0
              ? formatSignedMoney(data.realizedTodayBase, ccy)
              : "—"
          }
          sub={`${data.todayExecutionCount} exécution${data.todayExecutionCount > 1 ? "s" : ""} aujourd'hui`}
          tone={
            data.todayExecutionCount === 0
              ? "neutral"
              : data.realizedTodayBase >= 0
                ? "gain"
                : "loss"
          }
        />
        <KpiTile
          label="Réalisé MTD"
          value={
            data.mtdClosedCount > 0
              ? formatSignedMoney(data.realizedMtdBase, ccy)
              : "—"
          }
          sub={`${data.mtdClosedCount} trade${data.mtdClosedCount > 1 ? "s" : ""} clôturé${data.mtdClosedCount > 1 ? "s" : ""}`}
          tone={
            data.mtdClosedCount === 0
              ? "neutral"
              : data.realizedMtdBase >= 0
                ? "gain"
                : "loss"
          }
        />
        <KpiTile
          label="Win rate"
          value={data.mtdWinRate !== null ? formatPct(data.mtdWinRate) : "—"}
          sub="MTD · trades clôturés seulement"
        />
        <KpiTile
          label="Frais MTD"
          value={data.feesMtdBase > 0 ? formatMoney(data.feesMtdBase, ccy) : "—"}
          sub="commissions IBKR"
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card
          title="Courbe d'equity — NAV"
          subtitle="Snapshot quotidien IBKR (Activity Flex) · devise de base"
          className="lg:col-span-2"
        >
          <EquityCurve points={data.equityCurve} currency={ccy} />
        </Card>

        <Card title="Échéances ≤ 7 j" subtitle="Options du portefeuille">
          {data.upcomingExpirations.length === 0 ? (
            <p className="py-12 text-center text-sm text-ink-mute">
              Aucune option n&apos;expire dans les 7 prochains jours.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {data.upcomingExpirations.map((o) => (
                <li
                  key={o.label}
                  className="flex items-center justify-between rounded-lg border border-edge-soft bg-surface-2/40 px-3 py-2"
                >
                  <div>
                    <p className="font-mono text-[13px]">{o.label}</p>
                    <p className="text-xs text-ink-mute">
                      {formatQty(Math.abs(o.quantity))} ct
                      {Math.abs(o.quantity) > 1 ? "s" : ""} × {o.multiplier}
                    </p>
                  </div>
                  <span
                    className={`font-mono text-sm font-semibold tabular-nums ${
                      o.dte <= 2 ? "text-warn" : ""
                    }`}
                  >
                    {o.dte} j
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card
          title="Dernières exécutions IBKR"
          subtitle="Importées via Flex (Trade Confirms ~10 min après le fill)"
        >
          {data.recentExecutions.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-mute">
              Aucune exécution importée pour l&apos;instant.
            </p>
          ) : (
            <ul className="divide-y divide-edge-soft">
              {data.recentExecutions.map((e) => (
                <li
                  key={e.id}
                  className="flex items-center justify-between py-2 text-sm"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`w-12 rounded px-1.5 py-px text-center text-[10px] font-semibold ${
                        e.side === "BUY"
                          ? "bg-surface-2 text-ink-soft"
                          : "bg-surface-2 text-ink-soft"
                      }`}
                    >
                      {e.side === "BUY" ? "ACHAT" : "VENTE"}
                    </span>
                    <span className="font-mono text-[13px]">{e.symbol}</span>
                    <span className="font-mono tabular-nums text-ink-soft">
                      {formatQty(e.quantity)} @ {formatPrice(e.price, e.currency)}
                    </span>
                  </div>
                  <span className="text-xs text-ink-mute">
                    {formatDateTime(e.tradeTime)} · frais{" "}
                    {formatMoney(e.commission, e.currency)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Alertes récentes" subtitle="Derniers déclenchements">
          {data.recentAlerts.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-mute">
              Aucune alerte déclenchée pour l&apos;instant.
            </p>
          ) : (
            <ul className="divide-y divide-edge-soft">
              {data.recentAlerts.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between py-2 text-sm"
                >
                  <span>{a.message.replace(/^ALERT DESK — /, "")}</span>
                  <span className="shrink-0 pl-3 text-xs text-ink-mute">
                    {formatDateTime(a.triggeredAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
