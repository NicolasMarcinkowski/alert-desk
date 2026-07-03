/**
 * Agrégats analytics — trades CLÔTURÉS uniquement (grille KPI du plan).
 *
 * Le net par round-trip est calculé exactement au niveau exécution :
 * net = Σ(fifoPnlRealized × fx) − Σ(|commission| × fx). Pas de ratio de
 * Sharpe en v1 (volontaire). Le max drawdown se calcule sur le NAV ajusté
 * des dépôts/retraits, sinon un retrait ressemble à une perte.
 *
 * Volume ≤ quelques milliers de trades pour ≤5 users : agrégation en
 * TypeScript sur requêtes Prisma ciblées (les vues SQL du plan deviendraient
 * utiles à une tout autre échelle).
 */

import { prisma } from "@/lib/db/client";

export type AnalyticsPeriod = "30d" | "90d" | "ytd" | "1y" | "all";

export const PERIODS: { key: AnalyticsPeriod; label: string }[] = [
  { key: "30d", label: "30 j" },
  { key: "90d", label: "90 j" },
  { key: "ytd", label: "YTD" },
  { key: "1y", label: "1 an" },
  { key: "all", label: "Tout" },
];

function periodStart(period: AnalyticsPeriod, now = new Date()): Date | null {
  switch (period) {
    case "30d":
      return new Date(now.getTime() - 30 * 86_400_000);
    case "90d":
      return new Date(now.getTime() - 90 * 86_400_000);
    case "ytd":
      return new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    case "1y":
      return new Date(now.getTime() - 365 * 86_400_000);
    case "all":
      return null;
  }
}

export interface AnalyticsData {
  period: AnalyticsPeriod;
  baseCurrency: string;
  kpis: {
    netRealized: number;
    winRate: number | null;
    profitFactor: number | null; // null = pas de perte → "∞"
    hasLosses: boolean;
    expectancy: number | null;
    avgWin: number | null;
    avgLoss: number | null;
    fees: number;
    tradeCount: number;
    winCount: number;
    lossCount: number;
    maxDrawdown: number | null;
    maxDrawdownPct: number | null;
  };
  equity: { date: Date; nav: number; adjusted: number; drawdownPct: number }[];
  dailyPnl: { date: string; pnl: number }[];
  byUnderlying: { label: string; pnl: number; count: number }[];
  byStrategy: { label: string; pnl: number; count: number }[];
  bySecType: { label: string; pnl: number; count: number }[];
  byDirection: { label: string; pnl: number; count: number }[];
}

export async function getAnalytics(
  userId: string,
  period: AnalyticsPeriod
): Promise<AnalyticsData> {
  const from = periodStart(period);
  const accounts = await prisma.ibkrAccount.findMany({
    where: { userId },
    select: { id: true, baseCurrency: true },
  });
  const accountIds = accounts.map((a) => a.id);
  const baseCurrency = accounts[0]?.baseCurrency ?? "EUR";

  // Round-trips clôturés dans la période, avec leurs exécutions
  const trips = await prisma.roundTrip.findMany({
    where: {
      ibkrAccountId: { in: accountIds },
      status: "CLOSED",
      ...(from ? { closedAt: { gte: from } } : {}),
    },
    include: {
      instrument: {
        select: { symbol: true, underlyingSymbol: true, secType: true },
      },
      executions: {
        select: {
          fifoPnlRealized: true,
          commission: true,
          fxRateToBase: true,
          tradeDate: true,
        },
      },
    },
  });

  // Net exact par trip (niveau exécution)
  const tripNets = trips.map((t) => {
    let pnl = 0;
    let fees = 0;
    for (const e of t.executions) {
      const fx = Number(e.fxRateToBase);
      if (e.fifoPnlRealized !== null) pnl += Number(e.fifoPnlRealized) * fx;
      fees += Math.abs(Number(e.commission)) * fx;
    }
    return { trip: t, pnl, fees, net: pnl - fees };
  });

  const nets = tripNets.map((t) => t.net);
  const wins = nets.filter((n) => n > 0);
  const losses = nets.filter((n) => n <= 0);
  const grossWins = wins.reduce((s, n) => s + n, 0);
  const grossLosses = Math.abs(losses.reduce((s, n) => s + n, 0));
  const totalFees = tripNets.reduce((s, t) => s + t.fees, 0);
  const netRealized = nets.reduce((s, n) => s + n, 0);

  // Courbe d'equity ajustée des dépôts/retraits + drawdown
  const snapshots = await prisma.accountSnapshot.findMany({
    where: {
      ibkrAccountId: { in: accountIds },
      ...(from ? { date: { gte: from } } : {}),
    },
    orderBy: { date: "asc" },
    select: { date: true, nav: true, depositsWithdrawals: true },
  });
  const byDate = new Map<number, { nav: number; flows: number }>();
  for (const s of snapshots) {
    const key = s.date.getTime();
    const entry = byDate.get(key) ?? { nav: 0, flows: 0 };
    entry.nav += Number(s.nav);
    entry.flows += Number(s.depositsWithdrawals);
    byDate.set(key, entry);
  }
  let cumFlows = 0;
  let peak = -Infinity;
  let maxDrawdown = 0;
  let maxDrawdownPct = 0;
  const equity = Array.from(byDate.entries())
    .sort(([a], [b]) => a - b)
    .map(([time, { nav, flows }]) => {
      cumFlows += flows;
      const adjusted = nav - cumFlows;
      peak = Math.max(peak, adjusted);
      const dd = peak > 0 ? peak - adjusted : 0;
      const ddPct = peak > 0 ? (dd / peak) * 100 : 0;
      if (dd > maxDrawdown) {
        maxDrawdown = dd;
        maxDrawdownPct = ddPct;
      }
      return { date: new Date(time), nav, adjusted, drawdownPct: ddPct };
    });

  // P&L quotidien net (niveau exécution, par date de trade)
  const executions = await prisma.execution.findMany({
    where: {
      ibkrAccountId: { in: accountIds },
      ...(from ? { tradeDate: { gte: from } } : {}),
    },
    select: {
      fifoPnlRealized: true,
      commission: true,
      fxRateToBase: true,
      tradeDate: true,
    },
  });
  const daily = new Map<string, number>();
  for (const e of executions) {
    const fx = Number(e.fxRateToBase);
    const net =
      (e.fifoPnlRealized !== null ? Number(e.fifoPnlRealized) * fx : 0) -
      Math.abs(Number(e.commission)) * fx;
    const key = e.tradeDate.toISOString().slice(0, 10);
    daily.set(key, (daily.get(key) ?? 0) + net);
  }

  // Répartitions
  function groupBy(
    keyFn: (t: (typeof tripNets)[number]) => string
  ): { label: string; pnl: number; count: number }[] {
    const map = new Map<string, { pnl: number; count: number }>();
    for (const t of tripNets) {
      const key = keyFn(t);
      const entry = map.get(key) ?? { pnl: 0, count: 0 };
      entry.pnl += t.net;
      entry.count++;
      map.set(key, entry);
    }
    return Array.from(map.entries())
      .map(([label, v]) => ({ label, ...v }))
      .sort((a, b) => b.pnl - a.pnl);
  }

  return {
    period,
    baseCurrency,
    kpis: {
      netRealized,
      winRate: nets.length > 0 ? (wins.length / nets.length) * 100 : null,
      profitFactor:
        grossLosses > 0 ? grossWins / grossLosses : null,
      hasLosses: grossLosses > 0,
      expectancy: nets.length > 0 ? netRealized / nets.length : null,
      avgWin: wins.length > 0 ? grossWins / wins.length : null,
      avgLoss: losses.length > 0 ? -grossLosses / losses.length : null,
      fees: totalFees,
      tradeCount: nets.length,
      winCount: wins.length,
      lossCount: losses.length,
      maxDrawdown: equity.length > 1 ? maxDrawdown : null,
      maxDrawdownPct: equity.length > 1 ? maxDrawdownPct : null,
    },
    equity,
    dailyPnl: Array.from(daily.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, pnl]) => ({ date, pnl })),
    byUnderlying: groupBy(
      (t) => t.trip.instrument.underlyingSymbol ?? t.trip.instrument.symbol
    ),
    byStrategy: groupBy((t) => t.trip.strategy ?? "non classé"),
    bySecType: groupBy((t) =>
      t.trip.instrument.secType === "OPT" ? "Options" : "Actions"
    ),
    byDirection: groupBy((t) =>
      t.trip.direction === "LONG" ? "Long" : "Short"
    ),
  };
}
