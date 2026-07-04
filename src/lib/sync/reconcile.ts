/**
 * Réconciliation des positions courantes (table trading.positions).
 *
 * Deux sources, une vérité matérialisée :
 *  - nightly : rebuild complet depuis le dernier PositionSnapshot (autoritaire)
 *  - intraday : application des fills postérieurs au snapshot par-dessus
 *    (état INTRADAY_ESTIMATED)
 *  - drift : snapshot précédent + fills ≠ nouveau snapshot → flag + warning,
 *    le snapshot gagne toujours.
 */

import { prisma } from "@/lib/db/client";
import { Prisma } from "@/generated/prisma";
import { nextAvgCost } from "./avg-cost";

const D = Prisma.Decimal;
type Decimal = InstanceType<typeof D>;

interface WorkingPosition {
  instrumentId: string;
  quantity: Decimal; // signée
  avgCost: Decimal;
  currency: string;
  fxRateToBase: Decimal;
  touchedIntraday: boolean;
}

export interface ReconcileResult {
  warnings: string[];
  snapshotDate: Date | null;
}

/**
 * Reconstruit trading.positions pour un compte :
 * snapshot le plus récent comme base, puis fills intraday par-dessus.
 * Retourne les avertissements de dérive éventuels.
 */
export async function reconcilePositions(
  accountDbId: string
): Promise<ReconcileResult> {
  const warnings: string[] = [];
  const driftInstrumentIds = new Set<string>();

  const latestSnapshot = await prisma.positionSnapshot.findFirst({
    where: { brokerAccountId: accountDbId },
    orderBy: { date: "desc" },
    select: { date: true },
  });
  const snapshotDate = latestSnapshot?.date ?? null;

  // 1. Base : snapshot autoritaire (ou vide si aucun snapshot encore importé)
  const working = new Map<string, WorkingPosition>();
  if (snapshotDate) {
    const snapshots = await prisma.positionSnapshot.findMany({
      where: { brokerAccountId: accountDbId, date: snapshotDate },
    });
    for (const s of snapshots) {
      working.set(s.instrumentId, {
        instrumentId: s.instrumentId,
        quantity: new D(s.quantity),
        avgCost: new D(s.costBasisPrice),
        currency: s.currency,
        fxRateToBase: new D(s.fxRateToBase),
        touchedIntraday: false,
      });
    }
  }

  // 2. Contrôle de dérive : snapshot précédent + fills intermédiaires
  if (snapshotDate) {
    const prevSnapshot = await prisma.positionSnapshot.findFirst({
      where: { brokerAccountId: accountDbId, date: { lt: snapshotDate } },
      orderBy: { date: "desc" },
      select: { date: true },
    });
    if (prevSnapshot) {
      const [prevRows, fills] = await Promise.all([
        prisma.positionSnapshot.findMany({
          where: { brokerAccountId: accountDbId, date: prevSnapshot.date },
          select: { instrumentId: true, quantity: true },
        }),
        prisma.execution.findMany({
          where: {
            brokerAccountId: accountDbId,
            tradeDate: { gt: prevSnapshot.date, lte: snapshotDate },
          },
          select: { instrumentId: true, side: true, quantity: true },
        }),
      ]);
      const expected = new Map<string, Decimal>();
      for (const r of prevRows) {
        expected.set(r.instrumentId, new D(r.quantity));
      }
      for (const f of fills) {
        const signed =
          f.side === "BUY" ? new D(f.quantity) : new D(f.quantity).neg();
        expected.set(
          f.instrumentId,
          (expected.get(f.instrumentId) ?? new D(0)).plus(signed)
        );
      }
      for (const [instrumentId, expQty] of expected) {
        const actual = working.get(instrumentId)?.quantity ?? new D(0);
        if (!actual.equals(expQty)) {
          driftInstrumentIds.add(instrumentId);
        }
      }
      if (driftInstrumentIds.size > 0) {
        // Une seule requête pour les libellés des avertissements
        const instruments = await prisma.instrument.findMany({
          where: { id: { in: [...driftInstrumentIds] } },
          select: { id: true, symbol: true },
        });
        const symbolById = new Map(instruments.map((i) => [i.id, i.symbol]));
        for (const instrumentId of driftInstrumentIds) {
          const expQty = expected.get(instrumentId) ?? new D(0);
          const actual = working.get(instrumentId)?.quantity ?? new D(0);
          warnings.push(
            `Dérive ${symbolById.get(instrumentId) ?? instrumentId} : attendu ${expQty} (snapshot précédent + fills), snapshot ${actual}`
          );
        }
      }
    }
  }

  // 3. Fills intraday (postérieurs au snapshot) par-dessus la base
  const intradayFills = await prisma.execution.findMany({
    where: {
      brokerAccountId: accountDbId,
      ...(snapshotDate ? { tradeDate: { gt: snapshotDate } } : {}),
    },
    orderBy: { tradeTime: "asc" },
  });

  for (const f of intradayFills) {
    const signed = f.side === "BUY" ? new D(f.quantity) : new D(f.quantity).neg();
    const current = working.get(f.instrumentId) ?? {
      instrumentId: f.instrumentId,
      quantity: new D(0),
      avgCost: new D(0),
      currency: f.currency,
      fxRateToBase: new D(f.fxRateToBase),
      touchedIntraday: false,
    };
    const price = new D(f.price);
    working.set(f.instrumentId, {
      ...current,
      quantity: current.quantity.plus(signed),
      avgCost: nextAvgCost(current.quantity, current.avgCost, signed, price),
      fxRateToBase: new D(f.fxRateToBase),
      touchedIntraday: true,
    });
  }

  // 4. Matérialisation
  const keptInstrumentIds: string[] = [];
  for (const pos of working.values()) {
    if (pos.quantity.isZero()) continue;
    keptInstrumentIds.push(pos.instrumentId);
    const data = {
      quantity: pos.quantity,
      avgCost: pos.avgCost,
      currency: pos.currency,
      fxRateToBase: pos.fxRateToBase,
      state: pos.touchedIntraday
        ? ("INTRADAY_ESTIMATED" as const)
        : ("SNAPSHOT_CONFIRMED" as const),
      snapshotDate,
      driftDetected: driftInstrumentIds.has(pos.instrumentId),
    };
    await prisma.position.upsert({
      where: {
        brokerAccountId_instrumentId: {
          brokerAccountId: accountDbId,
          instrumentId: pos.instrumentId,
        },
      },
      create: {
        brokerAccountId: accountDbId,
        instrumentId: pos.instrumentId,
        ...data,
      },
      update: data,
    });
  }

  // Positions clôturées : disparues du snapshot et sans résidu intraday
  await prisma.position.deleteMany({
    where: {
      brokerAccountId: accountDbId,
      instrumentId: { notIn: keptInstrumentIds },
    },
  });

  return { warnings, snapshotDate };
}
