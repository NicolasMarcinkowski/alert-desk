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
      brokerAccountId: accountDbId,
      instrument: { secType: { in: ["STK", "OPT"] } },
    },
  });

  for (const { instrumentId } of instruments) {
    const executions = await prisma.execution.findMany({
      where: { brokerAccountId: accountDbId, instrumentId },
      orderBy: [{ tradeTime: "asc" }, { createdAt: "asc" }],
      include: { instrument: { select: { multiplier: true } } },
    });

    const trips: TripDraft[] = [];
    let current: TripDraft | null = null;
    let runningQty = new D(0);
    // Suivi du PRU moyen — sert au P&L des exécutions MANUAL (pas de
    // fifoPnlRealized broker pour la saisie manuelle : on le calcule en
    // méthode PRU moyen et on le matérialise sur l'exécution, ce qui rend
    // journal/analytics/dashboard identiques pour tous les brokers).
    let avgCost = new D(0);

    for (const e of executions) {
      const signed =
        e.side === "BUY" ? new D(e.quantity) : new D(e.quantity).neg();
      const before = runningQty;
      runningQty = runningQty.plus(signed);
      const price = new D(e.price);
      const multiplier = new D(e.instrument.multiplier);

      const reducing =
        !before.isZero() && before.isNegative() !== signed.isNegative();

      if (e.source === "MANUAL" && reducing) {
        const reduced = D.min(before.abs(), signed.abs());
        const dirSign = before.isNegative() ? new D(-1) : new D(1);
        const pnl = price
          .minus(avgCost)
          .times(reduced)
          .times(multiplier)
          .times(dirSign);
        if (e.fifoPnlRealized === null || !new D(e.fifoPnlRealized).equals(pnl)) {
          await prisma.execution.update({
            where: { id: e.id },
            data: { fifoPnlRealized: pnl },
          });
        }
        e.fifoPnlRealized = pnl;
      }

      // Mise à jour du PRU moyen (renforcement pondéré / réduction inchangée /
      // traversée de zéro = prix du fill)
      if (before.isZero()) {
        avgCost = price;
      } else if (!reducing) {
        avgCost = avgCost
          .times(before.abs())
          .plus(price.times(signed.abs()))
          .div(runningQty.abs());
      } else if (runningQty.isZero()) {
        avgCost = new D(0);
      } else if (before.isNegative() !== runningQty.isNegative()) {
        avgCost = price;
      }

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
          brokerAccountId_openExecutionKey: {
            brokerAccountId: accountDbId,
            openExecutionKey: trip.openExecutionKey,
          },
        },
        // Jamais de delete-and-recreate : les annotations journal survivent
        create: {
          brokerAccountId: accountDbId,
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

  // Trips orphelins (leur fill d'ouverture a été supprimé — saisie manuelle)
  await prisma.roundTrip.deleteMany({
    where: { brokerAccountId: accountDbId, executions: { none: {} } },
  });
}
