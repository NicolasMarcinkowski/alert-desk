/**
 * Saisie manuelle d'ordres — cœur de la v0 sans broker lié.
 *
 * On saisit des EXÉCUTIONS (pas des positions) : tout le pipeline existant
 * (réconciliation des positions, round-trips, journal, analytics, quotes
 * live, alertes) fonctionne alors à l'identique, broker lié ou pas.
 *
 * Les ordres manuels vivent sur des comptes broker=MANUAL uniquement —
 * jamais sur un compte IBKR, dont le snapshot autoritaire écraserait la
 * réconciliation.
 */

import { randomUUID } from "crypto";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/db/client";
import { buildOccSymbol } from "@/lib/occ";
import { reconcilePositions } from "@/lib/sync/reconcile";
import { rebuildRoundTrips } from "@/lib/sync/round-trips";
import { requestSubscriptionRefresh } from "@/lib/engine/runtime";
import { fetchQuote } from "@/lib/marketdata/registry";

const DEFAULT_MANUAL_LABEL = "Portefeuille manuel";

export interface ManualOrderInput {
  accountId?: string;
  side: "BUY" | "SELL";
  secType: "STK" | "OPT" | "OTHER";
  /** Ticker (STK/OTHER) ou sous-jacent (OPT) */
  symbol: string;
  currency: string;
  quantity: number;
  price: number;
  /** Frais, en positif */
  fees: number;
  /** ISO datetime */
  tradeAt: string;
  /** Taux devise → devise de base ; auto-résolu si absent */
  fxRateToBase?: number;
  // Options
  strike?: number;
  /** yyyy-mm-dd */
  expiry?: string;
  putCall?: "PUT" | "CALL";
  multiplier?: number;
}

export class ManualOrderError extends Error {}

function buildOcc(input: ManualOrderInput): string | null {
  if (
    input.secType !== "OPT" ||
    !input.strike ||
    !input.expiry ||
    !input.putCall
  ) {
    return null;
  }
  return buildOccSymbol(
    input.symbol.trim().toUpperCase(),
    input.expiry,
    input.strike,
    input.putCall
  );
}

async function resolveAccount(userId: string, accountId?: string) {
  if (accountId) {
    const account = await prisma.brokerAccount.findFirst({
      where: { id: accountId, userId },
    });
    if (!account) throw new ManualOrderError("compte introuvable");
    if (account.broker !== "MANUAL") {
      throw new ManualOrderError(
        "les ordres manuels ne peuvent être ajoutés que sur un compte manuel (les comptes liés sont synchronisés depuis le broker)"
      );
    }
    return account;
  }
  const existing = await prisma.brokerAccount.findFirst({
    where: { userId, broker: "MANUAL" },
    orderBy: { createdAt: "asc" },
  });
  if (existing) return existing;
  return prisma.brokerAccount.create({
    data: {
      userId,
      label: DEFAULT_MANUAL_LABEL,
      broker: "MANUAL",
      baseCurrency: "EUR",
    },
  });
}

/** Réutilise un instrument existant (même sous-jacent IBKR le cas échéant), sinon en crée un. */
async function resolveInstrument(input: ManualOrderInput): Promise<string> {
  const symbol = input.symbol.trim().toUpperCase();
  const occSymbol = buildOcc(input);

  if (input.secType === "OPT") {
    if (!occSymbol) {
      throw new ManualOrderError(
        "option incomplète : sous-jacent, strike, échéance et call/put requis"
      );
    }
    // occSymbol n'est plus unique (un placeholder "manual:" et l'instrument
    // IBKR réel peuvent coexister) : on réutilise en priorité le conid réel
    // (tri : "12345…" < "manual:…") plutôt que le placeholder.
    const existing = await prisma.instrument.findFirst({
      where: { occSymbol },
      orderBy: { conid: "asc" },
    });
    if (existing) return existing.id;
    const created = await prisma.instrument.create({
      data: {
        conid: `manual:${occSymbol}`,
        symbol: occSymbol,
        secType: "OPT",
        currency: input.currency,
        multiplier: String(input.multiplier ?? 100),
        underlyingSymbol: symbol,
        strike: String(input.strike),
        expiry: new Date(`${input.expiry}T00:00:00Z`),
        putCall: input.putCall,
        occSymbol,
      },
    });
    return created.id;
  }

  const secType = input.secType === "STK" ? "STK" : "OTHER";
  const existing = await prisma.instrument.findFirst({
    where: { symbol, secType, currency: input.currency },
  });
  if (existing) return existing.id;
  const created = await prisma.instrument.create({
    data: {
      conid: `manual:${symbol}.${input.currency}`,
      symbol,
      secType,
      currency: input.currency,
      multiplier: String(input.multiplier ?? 1),
    },
  });
  return created.id;
}

/** USD saisi sur un compte base EUR → tente USDEUR=X, sinon 1 (best effort). */
async function resolveFx(
  input: ManualOrderInput,
  baseCurrency: string
): Promise<number> {
  if (input.fxRateToBase && input.fxRateToBase > 0) return input.fxRateToBase;
  if (input.currency === baseCurrency) return 1;
  const quote = await fetchQuote({
    kind: "STK",
    symbol: `${input.currency}${baseCurrency}=X`,
  });
  return quote?.last && quote.last > 0 ? quote.last : 1;
}

export async function addManualExecution(
  userId: string,
  input: ManualOrderInput
): Promise<{ executionId: string; accountId: string }> {
  const account = await resolveAccount(userId, input.accountId);
  const instrumentId = await resolveInstrument(input);
  const fx = await resolveFx(input, account.baseCurrency);

  const tradeTime = new Date(input.tradeAt);
  if (Number.isNaN(tradeTime.getTime())) {
    throw new ManualOrderError("date d'exécution invalide");
  }
  const tradeDate = new Date(
    Date.UTC(
      tradeTime.getUTCFullYear(),
      tradeTime.getUTCMonth(),
      tradeTime.getUTCDate()
    )
  );
  const multiplier =
    input.secType === "OPT" ? (input.multiplier ?? 100) : (input.multiplier ?? 1);
  // Decimal (pas de flottant JS) — invariant 1 : la valeur persistée doit être
  // exacte (100 × 0,07 = 7, pas 7.000000000000001).
  const gross = new Prisma.Decimal(input.quantity)
    .mul(input.price)
    .mul(multiplier);

  const execution = await prisma.execution.create({
    data: {
      brokerAccountId: account.id,
      instrumentId,
      dedupeKey: `manual:${randomUUID()}`,
      side: input.side,
      quantity: String(input.quantity),
      price: String(input.price),
      proceeds: (input.side === "BUY" ? gross.negated() : gross).toString(),
      commission: String(-Math.abs(input.fees)),
      commissionCurrency: input.currency,
      currency: input.currency,
      fxRateToBase: String(fx),
      tradeDate,
      tradeTime,
      source: "MANUAL",
      // La saisie manuelle est sa propre autorité : pas de badge « estimé »
      confirmedByActivity: true,
    },
  });

  await reconcilePositions(account.id);
  await rebuildRoundTrips(account.id);
  requestSubscriptionRefresh();

  return { executionId: execution.id, accountId: account.id };
}

export async function deleteManualExecution(
  userId: string,
  executionId: string
): Promise<void> {
  const execution = await prisma.execution.findFirst({
    where: { id: executionId, account: { userId } },
    select: { id: true, source: true, brokerAccountId: true },
  });
  if (!execution) throw new ManualOrderError("exécution introuvable");
  if (execution.source !== "MANUAL") {
    throw new ManualOrderError(
      "seules les exécutions saisies manuellement peuvent être supprimées"
    );
  }

  await prisma.execution.delete({ where: { id: execution.id } });
  await reconcilePositions(execution.brokerAccountId);
  await rebuildRoundTrips(execution.brokerAccountId);
  requestSubscriptionRefresh();
}
