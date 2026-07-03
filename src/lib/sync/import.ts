/**
 * Import idempotent d'un relevé Flex parsé vers les tables trading.
 *
 * Dédup des exécutions par dedupeKey : ibExecID > transactionID > hash stable
 * (les champs volatils comme la commission sont EXCLUS du hash — les
 * assignations/expirations n'ont pas d'execID et peuvent être re-reportées
 * avec des frais corrigés).
 *
 * Le nightly Activity enrichit et gagne toujours sur l'intraday Trade Confirms
 * (fifoPnlRealized, commissions corrigées, confirmedByActivity).
 */

import { createHash } from "crypto";
import { prisma } from "@/lib/db/client";
import type {
  CashTransactionType,
  ExecutionSource,
} from "@/generated/prisma";
import type {
  FlexInstrumentRef,
  FlexTradeRow,
  ParsedFlexStatement,
} from "@/lib/flex/types";

export interface ImportCounters {
  fetched: number;
  inserted: number;
  updated: number;
  duplicates: number;
}

function addCounters(a: ImportCounters, b: ImportCounters): ImportCounters {
  return {
    fetched: a.fetched + b.fetched,
    inserted: a.inserted + b.inserted,
    updated: a.updated + b.updated,
    duplicates: a.duplicates + b.duplicates,
  };
}

export function emptyCounters(): ImportCounters {
  return { fetched: 0, inserted: 0, updated: 0, duplicates: 0 };
}

/** Format OCC compact (celui des fournisseurs de quotes) : AAPL260721C00190000 */
function buildOccSymbol(ref: FlexInstrumentRef): string | undefined {
  if (
    ref.assetCategory !== "OPT" ||
    !ref.underlyingSymbol ||
    !ref.expiry ||
    !ref.strike ||
    !ref.putCall
  ) {
    return undefined;
  }
  const [y, m, d] = ref.expiry.split("-");
  const strikeThousandths = Math.round(Number(ref.strike) * 1000)
    .toString()
    .padStart(8, "0");
  return `${ref.underlyingSymbol}${y.slice(2)}${m}${d}${ref.putCall.charAt(0)}${strikeThousandths}`;
}

export function buildDedupeKey(accountDbId: string, t: FlexTradeRow): string {
  if (t.ibExecId) return `exec:${t.ibExecId}`;
  if (t.transactionId) return `txn:${t.transactionId}`;
  const stable = [
    accountDbId,
    t.instrument.conid,
    t.tradeDate,
    t.buySell,
    t.quantity,
    t.price,
    t.codes ?? "",
  ].join("|");
  return `sha:${createHash("sha256").update(stable).digest("hex").slice(0, 32)}`;
}

function mapCashTransactionType(rawType: string): CashTransactionType {
  const t = rawType.toLowerCase();
  if (t.includes("dividend")) return "DIVIDEND";
  if (t.includes("withholding")) return "WITHHOLDING_TAX";
  if (t.includes("interest")) return "INTEREST";
  if (t.includes("deposit") || t.includes("withdrawal"))
    return "DEPOSIT_WITHDRAWAL";
  if (t.includes("fee")) return "BROKER_FEE";
  return "OTHER";
}

/** Cache conid → id (une passe d'import) pour éviter les upserts répétés. */
export async function ensureInstrument(
  cache: Map<string, string>,
  ref: FlexInstrumentRef
): Promise<string> {
  const cached = cache.get(ref.conid);
  if (cached) return cached;

  const data = {
    symbol: ref.symbol,
    secType: ref.assetCategory,
    description: ref.description,
    currency: ref.currency,
    multiplier: ref.multiplier ?? "1",
    underlyingConid: ref.underlyingConid,
    underlyingSymbol: ref.underlyingSymbol,
    strike: ref.strike,
    expiry: ref.expiry ? new Date(`${ref.expiry}T00:00:00Z`) : undefined,
    putCall: ref.putCall,
    occSymbol: buildOccSymbol(ref),
    exchange: ref.exchange,
    isin: ref.isin,
  };

  const instrument = await prisma.instrument.upsert({
    where: { conid: ref.conid },
    create: { conid: ref.conid, ...data },
    update: data,
  });
  cache.set(ref.conid, instrument.id);
  return instrument.id;
}

async function importTrades(
  accountDbId: string,
  trades: FlexTradeRow[],
  source: ExecutionSource,
  instrumentCache: Map<string, string>
): Promise<ImportCounters> {
  const counters = emptyCounters();
  counters.fetched = trades.length;

  for (const t of trades) {
    const instrumentId = await ensureInstrument(instrumentCache, t.instrument);
    const dedupeKey = buildDedupeKey(accountDbId, t);

    const existing = await prisma.execution.findUnique({
      where: {
        ibkrAccountId_dedupeKey: { ibkrAccountId: accountDbId, dedupeKey },
      },
      select: { id: true, source: true },
    });

    if (!existing) {
      await prisma.execution.create({
        data: {
          ibkrAccountId: accountDbId,
          instrumentId,
          dedupeKey,
          ibExecId: t.ibExecId,
          ibOrderId: t.ibOrderId,
          transactionId: t.transactionId,
          side: t.buySell,
          quantity: t.quantity,
          price: t.price,
          proceeds: t.proceeds ?? "0",
          commission: t.commission,
          commissionCurrency: t.commissionCurrency,
          currency: t.currency,
          fxRateToBase: t.fxRateToBase,
          tradeDate: new Date(`${t.tradeDate}T00:00:00Z`),
          tradeTime: t.tradeTimeUtc,
          settleDate: t.settleDate
            ? new Date(`${t.settleDate}T00:00:00Z`)
            : undefined,
          openCloseCode: t.openCloseCode,
          ibkrCodes: t.codes,
          fifoPnlRealized: t.fifoPnlRealized,
          source,
          confirmedByActivity: source === "ACTIVITY",
        },
      });
      counters.inserted++;
    } else if (source === "ACTIVITY") {
      // Activity = enregistrement corrigé et autoritaire
      await prisma.execution.update({
        where: { id: existing.id },
        data: {
          commission: t.commission,
          commissionCurrency: t.commissionCurrency,
          openCloseCode: t.openCloseCode,
          ibkrCodes: t.codes,
          fifoPnlRealized: t.fifoPnlRealized,
          fxRateToBase: t.fxRateToBase,
          source: "ACTIVITY",
          confirmedByActivity: true,
        },
      });
      counters.updated++;
    } else {
      counters.duplicates++;
    }
  }

  return counters;
}

/**
 * Importe un statement parsé. Retourne les compteurs agrégés.
 * `source` : TRADE_CONFIRMS (intraday) ou ACTIVITY (nightly, autoritaire).
 */
export async function importStatement(
  accountDbId: string,
  statement: ParsedFlexStatement,
  source: ExecutionSource
): Promise<ImportCounters> {
  const instrumentCache = new Map<string, string>();
  let counters = await importTrades(
    accountDbId,
    statement.trades,
    source,
    instrumentCache
  );

  // Snapshots de positions (Activity uniquement en pratique)
  for (const p of statement.openPositions) {
    const date = p.reportDate ?? statement.toDate;
    if (!date) continue;
    const instrumentId = await ensureInstrument(instrumentCache, p.instrument);
    await prisma.positionSnapshot.upsert({
      where: {
        ibkrAccountId_date_instrumentId: {
          ibkrAccountId: accountDbId,
          date: new Date(`${date}T00:00:00Z`),
          instrumentId,
        },
      },
      create: {
        ibkrAccountId: accountDbId,
        instrumentId,
        date: new Date(`${date}T00:00:00Z`),
        quantity: p.quantity,
        markPrice: p.markPrice,
        costBasisPrice: p.costBasisPrice,
        positionValue: p.positionValue,
        unrealizedPnl: p.unrealizedPnl,
        currency: p.currency,
        fxRateToBase: p.fxRateToBase,
      },
      update: {
        quantity: p.quantity,
        markPrice: p.markPrice,
        costBasisPrice: p.costBasisPrice,
        positionValue: p.positionValue,
        unrealizedPnl: p.unrealizedPnl,
        fxRateToBase: p.fxRateToBase,
      },
    });
    counters = addCounters(counters, {
      fetched: 1,
      inserted: 0,
      updated: 0,
      duplicates: 0,
    });
  }

  // Snapshots de NAV — depositsWithdrawals (période) affecté au toDate,
  // approximation documentée : la granularité fine viendra des CashTransactions
  const account = await prisma.ibkrAccount.findUniqueOrThrow({
    where: { id: accountDbId },
    select: { baseCurrency: true },
  });
  for (const e of statement.equitySummaries) {
    const isPeriodEnd = e.reportDate === statement.toDate;
    await prisma.accountSnapshot.upsert({
      where: {
        ibkrAccountId_date: {
          ibkrAccountId: accountDbId,
          date: new Date(`${e.reportDate}T00:00:00Z`),
        },
      },
      create: {
        ibkrAccountId: accountDbId,
        date: new Date(`${e.reportDate}T00:00:00Z`),
        nav: e.nav,
        cash: e.cash,
        stockValue: e.stockValue,
        optionValue: e.optionValue,
        depositsWithdrawals:
          isPeriodEnd && statement.depositsWithdrawals
            ? statement.depositsWithdrawals
            : "0",
        baseCurrency: account.baseCurrency,
      },
      update: {
        nav: e.nav,
        cash: e.cash,
        stockValue: e.stockValue,
        optionValue: e.optionValue,
        ...(isPeriodEnd && statement.depositsWithdrawals
          ? { depositsWithdrawals: statement.depositsWithdrawals }
          : {}),
      },
    });
  }

  for (const c of statement.cashBalances) {
    const date = c.date ?? statement.toDate;
    if (!date) continue;
    await prisma.cashBalance.upsert({
      where: {
        ibkrAccountId_date_currency: {
          ibkrAccountId: accountDbId,
          date: new Date(`${date}T00:00:00Z`),
          currency: c.currency,
        },
      },
      create: {
        ibkrAccountId: accountDbId,
        date: new Date(`${date}T00:00:00Z`),
        currency: c.currency,
        amount: c.amount,
        fxRateToBase: c.fxRateToBase,
      },
      update: { amount: c.amount, fxRateToBase: c.fxRateToBase },
    });
  }

  for (const ct of statement.cashTransactions) {
    const instrumentId = ct.instrument
      ? await ensureInstrument(instrumentCache, ct.instrument)
      : undefined;
    await prisma.cashTransaction.upsert({
      where: {
        ibkrAccountId_transactionId: {
          ibkrAccountId: accountDbId,
          transactionId: ct.transactionId,
        },
      },
      create: {
        ibkrAccountId: accountDbId,
        instrumentId,
        type: mapCashTransactionType(ct.rawType),
        amount: ct.amount,
        currency: ct.currency,
        fxRateToBase: ct.fxRateToBase,
        dateTime: ct.dateTimeUtc,
        description: ct.description,
        transactionId: ct.transactionId,
      },
      update: { amount: ct.amount, description: ct.description },
    });
  }

  for (const ca of statement.corporateActions) {
    const instrumentId = ca.instrument
      ? await ensureInstrument(instrumentCache, ca.instrument)
      : undefined;
    await prisma.corporateAction.upsert({
      where: {
        ibkrAccountId_transactionId: {
          ibkrAccountId: accountDbId,
          transactionId: ca.transactionId,
        },
      },
      create: {
        ibkrAccountId: accountDbId,
        instrumentId,
        ibkrType: ca.rawType,
        description: ca.description,
        reportDate: ca.reportDate
          ? new Date(`${ca.reportDate}T00:00:00Z`)
          : undefined,
        quantity: ca.quantity,
        value: ca.value,
        transactionId: ca.transactionId,
      },
      update: { description: ca.description, quantity: ca.quantity, value: ca.value },
    });
  }

  return counters;
}
