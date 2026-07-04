/**
 * Règle du PRU moyen — partagée par la réconciliation des positions et le
 * builder de round-trips (une seule implémentation, une seule vérité) :
 *  - position à plat → PRU = prix du fill
 *  - renforcement (même sens) → moyenne pondérée
 *  - réduction partielle → PRU inchangé
 *  - retour à plat → 0 ; traversée de zéro → prix du fill pour le résidu
 */

import { Prisma } from "@/generated/prisma";

const D = Prisma.Decimal;
type Decimal = InstanceType<typeof D>;

export function nextAvgCost(
  beforeQty: Decimal,
  avgCost: Decimal,
  signedQty: Decimal,
  price: Decimal
): Decimal {
  const after = beforeQty.plus(signedQty);
  if (beforeQty.isZero()) return price;
  if (beforeQty.isNegative() === signedQty.isNegative()) {
    return avgCost
      .times(beforeQty.abs())
      .plus(price.times(signedQty.abs()))
      .div(after.abs());
  }
  if (after.isZero()) return new D(0);
  if (beforeQty.isNegative() === after.isNegative()) return avgCost;
  return price;
}
