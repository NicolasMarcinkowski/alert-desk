/**
 * Couche de lecture pour les pages (server components).
 * Toutes les requêtes sont scopées à l'utilisateur via ses comptes IBKR.
 * Les Decimal sont convertis en number ici (affichage uniquement —
 * les agrégats de référence restent en base).
 */

import { cache } from "react";
import { prisma } from "@/lib/db/client";
import { daysToExpiry, formatOptionName } from "@/lib/utils/format";

// cache() de React : dédoublonne par requête HTTP (le Header du layout et la
// page appellent les mêmes lectures sur un même rendu)
const userAccountIds = cache(async (userId: string): Promise<string[]> => {
  const accounts = await prisma.brokerAccount.findMany({
    where: { userId },
    select: { id: true },
  });
  return accounts.map((a) => a.id);
});

// ─── Positions ───────────────────────────────────────────────────

export interface PositionRow {
  id: string;
  symbol: string;
  occSymbol: string | null;
  secType: "STK" | "OPT" | "CASH" | "OTHER";
  underlyingSymbol: string | null;
  expiry: Date | null;
  strike: unknown;
  putCall: "PUT" | "CALL" | null;
  multiplier: number;
  quantity: number;
  avgCost: number;
  currency: string;
  fxRateToBase: number;
  state: "SNAPSHOT_CONFIRMED" | "INTRADAY_ESTIMATED";
  driftDetected: boolean;
  /** Mark EOD du dernier snapshot (null si position purement intraday) —
   *  le P&L latent est recalculé côté client sur les quotes live */
  markPrice: number | null;
}

export interface PositionGroup {
  underlying: string;
  rows: PositionRow[];
}

export async function getPositionGroups(
  userId: string
): Promise<PositionGroup[]> {
  const accountIds = await userAccountIds(userId);
  // 2 requêtes quel que soit le nombre de positions (pas de N+1) :
  // le dernier mark par (compte, instrument) vient d'un seul findMany distinct
  const [positions, latestSnapshots] = await Promise.all([
    prisma.position.findMany({
      where: { brokerAccountId: { in: accountIds } },
      include: { instrument: true },
    }),
    prisma.positionSnapshot.findMany({
      where: { brokerAccountId: { in: accountIds } },
      orderBy: { date: "desc" },
      distinct: ["brokerAccountId", "instrumentId"],
      select: {
        brokerAccountId: true,
        instrumentId: true,
        markPrice: true,
      },
    }),
  ]);
  const markByKey = new Map(
    latestSnapshots.map((s) => [
      `${s.brokerAccountId}:${s.instrumentId}`,
      Number(s.markPrice),
    ])
  );

  const rows: PositionRow[] = positions.map((p) => ({
    id: p.id,
    symbol: p.instrument.symbol,
    occSymbol: p.instrument.occSymbol,
    secType: p.instrument.secType,
    underlyingSymbol: p.instrument.underlyingSymbol,
    expiry: p.instrument.expiry,
    strike: p.instrument.strike,
    putCall: p.instrument.putCall,
    multiplier: Number(p.instrument.multiplier),
    quantity: Number(p.quantity),
    avgCost: Number(p.avgCost),
    currency: p.currency,
    fxRateToBase: Number(p.fxRateToBase),
    state: p.state,
    driftDetected: p.driftDetected,
    markPrice: markByKey.get(`${p.brokerAccountId}:${p.instrumentId}`) ?? null,
  }));

  const groups = new Map<string, PositionRow[]>();
  for (const row of rows) {
    const key = row.underlyingSymbol ?? row.symbol;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  return Array.from(groups.entries())
    .map(([underlying, groupRows]) => ({
      underlying,
      rows: groupRows.sort(
        (a, b) =>
          (a.secType === "STK" ? -1 : 1) - (b.secType === "STK" ? -1 : 1)
      ),
    }))
    .sort((a, b) => a.underlying.localeCompare(b.underlying));
}

// ─── Live (header, dashboard) ────────────────────────────────────

/** Position allégée pour le calcul client du P&L latent live. */
export interface LivePositionLite {
  /** Clé du cache de quotes : ticker STK ou OCC compact OPT */
  key: string;
  quantity: number;
  avgCost: number;
  multiplier: number;
  fxRateToBase: number;
}

export interface HeaderStats {
  realizedTodayBase: number;
  executionsToday: number;
  baseCurrency: string;
  positions: LivePositionLite[];
}

export const getHeaderStats = cache(async function getHeaderStats(
  userId: string
): Promise<HeaderStats> {
  const accountIds = await userAccountIds(userId);
  const now = new Date();
  const todayUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );

  const [todayExecutions, positions, account] = await Promise.all([
    prisma.execution.findMany({
      where: { brokerAccountId: { in: accountIds }, tradeDate: todayUtc },
      select: { fifoPnlRealized: true, fxRateToBase: true },
    }),
    prisma.position.findMany({
      where: { brokerAccountId: { in: accountIds } },
      include: {
        instrument: {
          select: { symbol: true, occSymbol: true, secType: true, multiplier: true },
        },
      },
    }),
    prisma.brokerAccount.findFirst({
      where: { id: { in: accountIds } },
      orderBy: { createdAt: "asc" }, // devise d'affichage déterministe
      select: { baseCurrency: true },
    }),
  ]);

  let realizedToday = 0;
  for (const e of todayExecutions) {
    if (e.fifoPnlRealized !== null) {
      realizedToday += Number(e.fifoPnlRealized) * Number(e.fxRateToBase);
    }
  }

  return {
    realizedTodayBase: realizedToday,
    executionsToday: todayExecutions.length,
    baseCurrency: account?.baseCurrency ?? "EUR",
    positions: positions.map((p) => ({
      key:
        p.instrument.secType === "OPT"
          ? (p.instrument.occSymbol ?? p.instrument.symbol)
          : p.instrument.symbol,
      quantity: Number(p.quantity),
      avgCost: Number(p.avgCost),
      multiplier: Number(p.instrument.multiplier),
      fxRateToBase: Number(p.fxRateToBase),
    })),
  };
});

// ─── Journal ─────────────────────────────────────────────────────

export interface RoundTripRow {
  id: string;
  symbol: string;
  optionLabel: string | null;
  secType: string;
  direction: "LONG" | "SHORT";
  status: "OPEN" | "CLOSED";
  openedAt: Date;
  closedAt: Date | null;
  maxQuantity: number;
  realizedPnl: number | null;
  commissions: number;
  currency: string;
  pnlConfirmed: boolean;
  strategy: string | null;
  tags: string[];
  rating: number | null;
}

export interface JournalKpis {
  netRealizedBase: number;
  feesBase: number;
  closedCount: number;
  winCount: number;
  lossCount: number;
}

export async function getJournal(userId: string): Promise<{
  trips: RoundTripRow[];
  kpis: JournalKpis;
}> {
  const accountIds = await userAccountIds(userId);
  const trips = await prisma.roundTrip.findMany({
    where: { brokerAccountId: { in: accountIds } },
    include: {
      instrument: {
        select: {
          symbol: true,
          underlyingSymbol: true,
          secType: true,
          currency: true,
        },
      },
    },
    orderBy: [{ openedAt: "desc" }],
    take: 200,
  });

  const rows: RoundTripRow[] = trips.map((t) => ({
    id: t.id,
    symbol: t.instrument.underlyingSymbol ?? t.instrument.symbol,
    optionLabel: t.instrument.secType === "OPT" ? t.instrument.symbol : null,
    secType: t.instrument.secType,
    direction: t.direction,
    status: t.status,
    openedAt: t.openedAt,
    closedAt: t.closedAt,
    maxQuantity: Number(t.maxQuantity),
    realizedPnl: t.realizedPnl !== null ? Number(t.realizedPnl) : null,
    commissions: Number(t.commissions),
    currency: t.instrument.currency,
    pnlConfirmed: t.pnlConfirmed,
    strategy: t.strategy,
    tags: t.tags,
    rating: t.rating,
  }));

  // KPI globaux au niveau exécution (devise de base via fxRateToBase)
  const executions = await prisma.execution.findMany({
    where: { brokerAccountId: { in: accountIds } },
    select: { fifoPnlRealized: true, commission: true, fxRateToBase: true },
  });
  let realized = 0;
  let fees = 0;
  for (const e of executions) {
    const fx = Number(e.fxRateToBase);
    if (e.fifoPnlRealized !== null) realized += Number(e.fifoPnlRealized) * fx;
    fees += Math.abs(Number(e.commission)) * fx;
  }

  // WIN = P&L NET (frais déduits) positif — même sémantique que la table
  // du journal et que les analytics
  const closed = rows.filter((r) => r.status === "CLOSED");
  const winCount = closed.filter(
    (r) => (r.realizedPnl ?? 0) - r.commissions > 0
  ).length;

  return {
    trips: rows,
    kpis: {
      netRealizedBase: realized - fees,
      feesBase: fees,
      closedCount: closed.length,
      winCount,
      lossCount: closed.length - winCount,
    },
  };
}

// ─── Dashboard ───────────────────────────────────────────────────

export interface DashboardData {
  nav: number | null;
  navDate: Date | null;
  baseCurrency: string;
  realizedTodayBase: number;
  todayExecutionCount: number;
  realizedMtdBase: number;
  mtdClosedCount: number;
  mtdWinRate: number | null;
  feesMtdBase: number;
  equityCurve: { date: Date; nav: number }[];
  upcomingExpirations: {
    label: string;
    dte: number;
    quantity: number;
    multiplier: number;
    strike: number | null;
    unrealizedBase: number | null;
  }[];
  recentExecutions: {
    id: string;
    symbol: string;
    side: "BUY" | "SELL";
    quantity: number;
    price: number;
    currency: string;
    tradeTime: Date;
    commission: number;
  }[];
  recentAlerts: {
    id: string;
    message: string;
    triggeredAt: Date;
  }[];
  hasAccounts: boolean;
}

export async function getDashboard(userId: string): Promise<DashboardData> {
  const accountIds = await userAccountIds(userId);
  const now = new Date();
  const todayUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  const monthStartUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
  );

  // Toutes les lectures indépendantes en parallèle ; le NAV par compte vient
  // d'une seule requête distinct (pas de findFirst par compte en boucle)
  const [
    latestSnaps,
    executions,
    mtdClosed,
    snapshots,
    optPositions,
    recentExecutions,
    recentAlerts,
  ] = await Promise.all([
    prisma.accountSnapshot.findMany({
      where: { brokerAccountId: { in: accountIds } },
      orderBy: { date: "desc" },
      distinct: ["brokerAccountId"],
      select: { nav: true, date: true, baseCurrency: true },
    }),
    prisma.execution.findMany({
      where: {
        brokerAccountId: { in: accountIds },
        tradeDate: { gte: monthStartUtc },
      },
      select: {
        fifoPnlRealized: true,
        commission: true,
        fxRateToBase: true,
        tradeDate: true,
      },
    }),
    prisma.roundTrip.findMany({
      where: {
        brokerAccountId: { in: accountIds },
        status: "CLOSED",
        closedAt: { gte: monthStartUtc },
      },
      select: { realizedPnl: true, commissions: true },
    }),
    prisma.accountSnapshot.findMany({
      where: {
        brokerAccountId: { in: accountIds },
        date: { gte: new Date(now.getTime() - 180 * 86_400_000) },
      },
      orderBy: { date: "asc" },
      select: { date: true, nav: true },
    }),
    prisma.position.findMany({
      where: {
        brokerAccountId: { in: accountIds },
        instrument: {
          secType: "OPT",
          expiry: { lte: new Date(now.getTime() + 7 * 86_400_000) },
        },
      },
      include: { instrument: true },
    }),
    prisma.execution.findMany({
      where: { brokerAccountId: { in: accountIds } },
      orderBy: { tradeTime: "desc" },
      take: 8,
      include: { instrument: { select: { symbol: true } } },
    }),
    prisma.alertEvent.findMany({
      where: { rule: { userId } },
      orderBy: { triggeredAt: "desc" },
      take: 5,
      select: { id: true, message: true, triggeredAt: true },
    }),
  ]);

  let nav: number | null = null;
  let navDate: Date | null = null;
  let baseCurrency = "EUR";
  for (const snap of latestSnaps) {
    nav = (nav ?? 0) + Number(snap.nav);
    if (navDate === null || snap.date.getTime() > navDate.getTime()) {
      navDate = snap.date;
    }
    baseCurrency = snap.baseCurrency;
  }

  let realizedToday = 0;
  let todayCount = 0;
  let realizedMtd = 0;
  let feesMtd = 0;
  for (const e of executions) {
    const fx = Number(e.fxRateToBase);
    const fifo = e.fifoPnlRealized !== null ? Number(e.fifoPnlRealized) * fx : 0;
    realizedMtd += fifo;
    feesMtd += Math.abs(Number(e.commission)) * fx;
    if (e.tradeDate.getTime() === todayUtc.getTime()) {
      realizedToday += fifo;
      todayCount++;
    }
  }

  // WIN = P&L net (frais déduits) — même sémantique que journal et analytics
  const mtdWins = mtdClosed.filter(
    (t) =>
      t.realizedPnl !== null &&
      Number(t.realizedPnl) - Number(t.commissions) > 0
  ).length;

  const byDate = new Map<number, number>();
  for (const s of snapshots) {
    const key = s.date.getTime();
    byDate.set(key, (byDate.get(key) ?? 0) + Number(s.nav));
  }
  const equityCurve = Array.from(byDate.entries())
    .sort(([a], [b]) => a - b)
    .map(([time, value]) => ({ date: new Date(time), nav: value }));

  return {
    nav,
    navDate,
    baseCurrency,
    realizedTodayBase: realizedToday,
    todayExecutionCount: todayCount,
    realizedMtdBase: realizedMtd,
    mtdClosedCount: mtdClosed.length,
    mtdWinRate:
      mtdClosed.length > 0 ? (mtdWins / mtdClosed.length) * 100 : null,
    feesMtdBase: feesMtd,
    equityCurve,
    upcomingExpirations: optPositions
      .filter((p) => p.instrument.expiry)
      .map((p) => ({
        label: formatOptionName(p.instrument),
        dte: daysToExpiry(p.instrument.expiry!),
        quantity: Number(p.quantity),
        multiplier: Number(p.instrument.multiplier),
        strike:
          p.instrument.strike !== null ? Number(p.instrument.strike) : null,
        // Le P&L latent par échéance arrive avec les quotes live (M2)
        unrealizedBase: null,
      }))
      .sort((a, b) => a.dte - b.dte),
    recentExecutions: recentExecutions.map((e) => ({
      id: e.id,
      symbol: e.instrument.symbol,
      side: e.side,
      quantity: Number(e.quantity),
      price: Number(e.price),
      currency: e.currency,
      tradeTime: e.tradeTime,
      commission: Math.abs(Number(e.commission)),
    })),
    recentAlerts,
    hasAccounts: accountIds.length > 0,
  };
}
