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

/** Applique un fill signé sur (qty, avgCost) — PRU pondéré à l'augmentation,
 *  PRU conservé à la réduction, PRU = prix du fill en cas de traversée de zéro. */
function applyFill(
  pos: { quantity: Decimal; avgCost: Decimal },
  signedQty: Decimal,
  price: Decimal
): { quantity: Decimal; avgCost: Decimal } {
  const newQty = pos.quantity.plus(signedQty);
  const sameDirection =
    pos.quantity.isZero() || pos.quantity.isNegative() === signedQty.isNegative();

  if (pos.quantity.isZero()) {
    return { quantity: newQty, avgCost: price };
  }
  if (sameDirection) {
    // Renforcement : moyenne pondérée
    const totalCost = pos.avgCost
      .times(pos.quantity.abs())
      .plus(price.times(signedQty.abs()));
    return { quantity: newQty, avgCost: totalCost.div(newQty.abs()) };
  }
  if (newQty.isZero()) {
    return { quantity: newQty, avgCost: new D(0) };
  }
  if (pos.quantity.isNegative() === newQty.isNegative()) {
    // Réduction partielle : PRU inchangé
    return { quantity: newQty, avgCost: pos.avgCost };
  }
  // Traversée de zéro : le résidu part au prix du fill
  return { quantity: newQty, avgCost: price };
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

  const latestSnapshot = await prisma.positionSnapshot.findFirst({
    where: { ibkrAccountId: accountDbId },
    orderBy: { date: "desc" },
    select: { date: true },
  });
  const snapshotDate = latestSnapshot?.date ?? null;

  // 1. Base : snapshot autoritaire (ou vide si aucun snapshot encore importé)
  const working = new Map<string, WorkingPosition>();
  if (snapshotDate) {
    const snapshots = await prisma.positionSnapshot.findMany({
      where: { ibkrAccountId: accountDbId, date: snapshotDate },
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
      where: { ibkrAccountId: accountDbId, date: { lt: snapshotDate } },
      orderBy: { date: "desc" },
      select: { date: true },
    });
    if (prevSnapshot) {
      const prevRows = await prisma.positionSnapshot.findMany({
        where: { ibkrAccountId: accountDbId, date: prevSnapshot.date },
        select: { instrumentId: true, quantity: true },
      });
      const fills = await prisma.execution.findMany({
        where: {
          ibkrAccountId: accountDbId,
          tradeDate: { gt: prevSnapshot.date, lte: snapshotDate },
        },
        select: { instrumentId: true, side: true, quantity: true },
      });
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
          const instr = await prisma.instrument.findUnique({
            where: { id: instrumentId },
            select: { symbol: true },
          });
          warnings.push(
            `Dérive ${instr?.symbol ?? instrumentId} : attendu ${expQty} (snapshot précédent + fills), snapshot ${actual}`
          );
        }
      }
    }
  }
  const driftInstruments = new Set(
    warnings.map((w) => w.split(" ")[1]).filter(Boolean)
  );

  // 3. Fills intraday (postérieurs au snapshot) par-dessus la base
  const intradayFills = await prisma.execution.findMany({
    where: {
      ibkrAccountId: accountDbId,
      ...(snapshotDate ? { tradeDate: { gt: snapshotDate } } : {}),
    },
    orderBy: { tradeTime: "asc" },
    include: { instrument: { select: { currency: true } } },
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
    const next = applyFill(current, signed, new D(f.price));
    working.set(f.instrumentId, {
      ...current,
      quantity: next.quantity,
      avgCost: next.avgCost,
      fxRateToBase: new D(f.fxRateToBase),
      touchedIntraday: true,
    });
  }

  // 4. Matérialisation
  const keptInstrumentIds: string[] = [];
  for (const pos of working.values()) {
    if (pos.quantity.isZero()) continue;
    keptInstrumentIds.push(pos.instrumentId);
    const instr = await prisma.instrument.findUnique({
      where: { id: pos.instrumentId },
      select: { symbol: true },
    });
    await prisma.position.upsert({
      where: {
        ibkrAccountId_instrumentId: {
          ibkrAccountId: accountDbId,
          instrumentId: pos.instrumentId,
        },
      },
      create: {
        ibkrAccountId: accountDbId,
        instrumentId: pos.instrumentId,
        quantity: pos.quantity,
        avgCost: pos.avgCost,
        currency: pos.currency,
        fxRateToBase: pos.fxRateToBase,
        state: pos.touchedIntraday ? "INTRADAY_ESTIMATED" : "SNAPSHOT_CONFIRMED",
        snapshotDate,
        driftDetected: instr ? driftInstruments.has(instr.symbol) : false,
      },
      update: {
        quantity: pos.quantity,
        avgCost: pos.avgCost,
        currency: pos.currency,
        fxRateToBase: pos.fxRateToBase,
        state: pos.touchedIntraday ? "INTRADAY_ESTIMATED" : "SNAPSHOT_CONFIRMED",
        snapshotDate,
        driftDetected: instr ? driftInstruments.has(instr.symbol) : false,
      },
    });
  }

  // Positions clôturées : disparues du snapshot et sans résidu intraday
  await prisma.position.deleteMany({
    where: {
      ibkrAccountId: accountDbId,
      instrumentId: { notIn: keptInstrumentIds },
    },
  });

  return { warnings, snapshotDate };
}
