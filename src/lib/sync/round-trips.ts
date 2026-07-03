/**
 * Construction des round-trips (cycles flat-to-flat par instrument).
 *
 * Identité stable = dedupeKey du fill d'ouverture → UPSERT UNIQUEMENT :
 * les champs journal (strategy/tags/notes/rating) appartiennent à
 * l'utilisateur et ne sont jamais touchés au rebuild.
 *
 * P&L réalisé = somme des fifoPnlRealized d'IBKR (jamais recalculé).
 * NB : fifoPnlRealized IBKR est hors commissions — le "net" s'obtient en
 * retranchant `commissions` (stockées positives).
 */

import { prisma } from "@/lib/db/client";
import { Prisma } from "@/generated/prisma";

const D = Prisma.Decimal;
type Decimal = InstanceType<typeof D>;

interface TripDraft {
  openExecutionKey: string;
  direction: "LONG" | "SHORT";
  openedAt: Date;
  closedAt: Date | null;
  maxQuantity: Decimal;
  realizedPnl: Decimal;
  realizedPnlBase: Decimal;
  commissions: Decimal;
  allClosesConfirmed: boolean;
  hasFifo: boolean;
  executionIds: string[];
}

/**
 * Reconstruit les round-trips d'un compte (tous instruments non-CASH ayant
 * des exécutions). Appelé après chaque import — les corrections tardives
 * IBKR modifient le P&L rétroactivement, on ne cache jamais ces valeurs.
 */
export async function rebuildRoundTrips(accountDbId: string): Promise<void> {
  const instruments = await prisma.execution.groupBy({
    by: ["instrumentId"],
    where: {
      ibkrAccountId: accountDbId,
      instrument: { secType: { in: ["STK", "OPT"] } },
    },
  });

  for (const { instrumentId } of instruments) {
    const executions = await prisma.execution.findMany({
      where: { ibkrAccountId: accountDbId, instrumentId },
      orderBy: [{ tradeTime: "asc" }, { createdAt: "asc" }],
    });

    const trips: TripDraft[] = [];
    let current: TripDraft | null = null;
    let runningQty = new D(0);

    for (const e of executions) {
      const signed =
        e.side === "BUY" ? new D(e.quantity) : new D(e.quantity).neg();
      const before = runningQty;
      runningQty = runningQty.plus(signed);

      if (before.isZero() && !runningQty.isZero()) {
        current = {
          openExecutionKey: e.dedupeKey,
          direction: runningQty.isNegative() ? "SHORT" : "LONG",
          openedAt: e.tradeTime,
          closedAt: null,
          maxQuantity: runningQty.abs(),
          realizedPnl: new D(0),
          realizedPnlBase: new D(0),
          commissions: new D(0),
          allClosesConfirmed: true,
          hasFifo: false,
          executionIds: [],
        };
        trips.push(current);
      }

      if (!current) {
        // Fill orphelin (position issue d'avant l'historique importé) :
        // on ouvre un trip dessus pour ne rien perdre
        current = {
          openExecutionKey: e.dedupeKey,
          direction: signed.isNegative() ? "SHORT" : "LONG",
          openedAt: e.tradeTime,
          closedAt: null,
          maxQuantity: signed.abs(),
          realizedPnl: new D(0),
          realizedPnlBase: new D(0),
          commissions: new D(0),
          allClosesConfirmed: true,
          hasFifo: false,
          executionIds: [],
        };
        trips.push(current);
      }

      current.executionIds.push(e.id);
      current.commissions = current.commissions.plus(new D(e.commission).abs());
      if (runningQty.abs().greaterThan(current.maxQuantity)) {
        current.maxQuantity = runningQty.abs();
      }

      const isReducing = !before.isZero() && runningQty.abs().lessThan(before.abs());
      if (e.fifoPnlRealized !== null) {
        const fifo = new D(e.fifoPnlRealized);
        if (!fifo.isZero() || isReducing) {
          current.realizedPnl = current.realizedPnl.plus(fifo);
          current.realizedPnlBase = current.realizedPnlBase.plus(
            fifo.times(new D(e.fxRateToBase))
          );
          current.hasFifo = true;
        }
      }
      if (isReducing && !e.confirmedByActivity) {
        current.allClosesConfirmed = false;
      }

      if (runningQty.isZero()) {
        current.closedAt = e.tradeTime;
        current = null;
      }
    }

    for (const trip of trips) {
      const status = trip.closedAt ? "CLOSED" : "OPEN";
      const computed = {
        status,
        direction: trip.direction,
        openedAt: trip.openedAt,
        closedAt: trip.closedAt,
        maxQuantity: trip.maxQuantity,
        realizedPnl: trip.hasFifo ? trip.realizedPnl : null,
        realizedPnlBase: trip.hasFifo ? trip.realizedPnlBase : null,
        commissions: trip.commissions,
        pnlConfirmed: status === "CLOSED" && trip.allClosesConfirmed && trip.hasFifo,
      } as const;

      const saved = await prisma.roundTrip.upsert({
        where: {
          ibkrAccountId_openExecutionKey: {
            ibkrAccountId: accountDbId,
            openExecutionKey: trip.openExecutionKey,
          },
        },
        // Jamais de delete-and-recreate : les annotations journal survivent
        create: {
          ibkrAccountId: accountDbId,
          instrumentId,
          openExecutionKey: trip.openExecutionKey,
          ...computed,
        },
        update: computed,
      });

      await prisma.execution.updateMany({
        where: { id: { in: trip.executionIds } },
        data: { roundTripId: saved.id },
      });
    }
  }
}
