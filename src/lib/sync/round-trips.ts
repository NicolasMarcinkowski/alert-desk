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
 *
 * Exécutions MANUAL : pas de P&L broker — il est calculé en méthode PRU
 * moyen et matérialisé dans fifoPnlRealized (recalculé, ou remis à null si
 * le fill n'est plus réducteur après une suppression/insertion antidatée).
 */

import { prisma } from "@/lib/db/client";
import { Prisma } from "@/generated/prisma";
import { nextAvgCost } from "./avg-cost";

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

function newTripDraft(
  openKey: string,
  direction: "LONG" | "SHORT",
  openedAt: Date,
  maxQuantity: Decimal
): TripDraft {
  return {
    openExecutionKey: openKey,
    direction,
    openedAt,
    closedAt: null,
    maxQuantity,
    realizedPnl: new D(0),
    realizedPnlBase: new D(0),
    commissions: new D(0),
    allClosesConfirmed: true,
    hasFifo: false,
    executionIds: [],
  };
}

/**
 * Reconstruit les round-trips d'un compte. Appelé après chaque import ou
 * saisie/suppression manuelle — les corrections tardives IBKR et les
 * modifications d'historique changent le P&L rétroactivement, on ne cache
 * jamais ces valeurs.
 */
export async function rebuildRoundTrips(accountDbId: string): Promise<void> {
  // Une seule requête pour tout le compte, groupée en mémoire par instrument
  const allExecutions = await prisma.execution.findMany({
    where: {
      brokerAccountId: accountDbId,
      instrument: { secType: { in: ["STK", "OPT"] } },
    },
    orderBy: [{ tradeTime: "asc" }, { createdAt: "asc" }],
    include: { instrument: { select: { multiplier: true } } },
  });
  const byInstrument = new Map<string, typeof allExecutions>();
  for (const e of allExecutions) {
    const list = byInstrument.get(e.instrumentId) ?? [];
    list.push(e);
    byInstrument.set(e.instrumentId, list);
  }

  for (const [instrumentId, executions] of byInstrument) {
    const trips: TripDraft[] = [];
    let current: TripDraft | null = null;
    let runningQty = new D(0);
    // PRU moyen — sert au P&L des exécutions MANUAL (même règle que la
    // réconciliation des positions, via nextAvgCost)
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

      if (e.source === "MANUAL") {
        if (reducing) {
          const reduced = D.min(before.abs(), signed.abs());
          const dirSign = before.isNegative() ? new D(-1) : new D(1);
          const pnl = price
            .minus(avgCost)
            .times(reduced)
            .times(multiplier)
            .times(dirSign);
          if (
            e.fifoPnlRealized === null ||
            !new D(e.fifoPnlRealized).equals(pnl)
          ) {
            await prisma.execution.update({
              where: { id: e.id },
              data: { fifoPnlRealized: pnl },
            });
          }
          e.fifoPnlRealized = pnl;
        } else if (e.fifoPnlRealized !== null) {
          // Le fill n'est plus réducteur (fill d'ouverture après une
          // suppression/insertion antidatée) : purger le P&L matérialisé,
          // sinon il fuit dans le trip comme un P&L fantôme
          await prisma.execution.update({
            where: { id: e.id },
            data: { fifoPnlRealized: null },
          });
          e.fifoPnlRealized = null;
        }
      }

      avgCost = nextAvgCost(before, avgCost, signed, price);

      if (before.isZero() && !runningQty.isZero()) {
        current = newTripDraft(
          e.dedupeKey,
          runningQty.isNegative() ? "SHORT" : "LONG",
          e.tradeTime,
          runningQty.abs()
        );
        trips.push(current);
      }
      if (!current) {
        // Fill orphelin (position issue d'avant l'historique importé) :
        // on ouvre un trip dessus pour ne rien perdre
        current = newTripDraft(
          e.dedupeKey,
          signed.isNegative() ? "SHORT" : "LONG",
          e.tradeTime,
          signed.abs()
        );
        trips.push(current);
      }

      current.executionIds.push(e.id);
      current.commissions = current.commissions.plus(new D(e.commission).abs());
      if (runningQty.abs().greaterThan(current.maxQuantity)) {
        current.maxQuantity = runningQty.abs();
      }

      const isReducing =
        !before.isZero() && runningQty.abs().lessThan(before.abs());
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
        pnlConfirmed:
          status === "CLOSED" && trip.allClosesConfirmed && trip.hasFifo,
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
