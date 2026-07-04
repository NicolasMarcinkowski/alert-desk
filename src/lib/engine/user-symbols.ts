/**
 * Symboles qu'un utilisateur est en droit de voir sur le flux SSE :
 * ses positions ∪ ses règles d'alerte ∪ ses watchlists.
 * (Le cache de quotes est global au process — sans ce filtre, chaque
 * session verrait les symboles des positions des autres utilisateurs.)
 */

import { prisma } from "@/lib/db/client";

export async function getUserSymbolKeys(userId: string): Promise<Set<string>> {
  const [positions, items, rules] = await Promise.all([
    prisma.position.findMany({
      where: { account: { userId } },
      select: {
        instrument: {
          select: { symbol: true, secType: true, occSymbol: true },
        },
      },
    }),
    prisma.watchlistItem.findMany({
      where: { watchlist: { userId } },
      select: { symbol: true },
    }),
    prisma.alertRule.findMany({
      where: { userId, symbol: { not: null } },
      select: { symbol: true },
    }),
  ]);

  const keys = new Set<string>();
  for (const p of positions) {
    keys.add(
      p.instrument.secType === "OPT"
        ? (p.instrument.occSymbol ?? p.instrument.symbol)
        : p.instrument.symbol
    );
  }
  for (const item of items) keys.add(item.symbol);
  for (const rule of rules) keys.add(rule.symbol!);
  return keys;
}
