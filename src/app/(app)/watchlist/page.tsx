import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { getFinnhub } from "@/lib/marketdata/registry";
import { PageTitle } from "@/components/ui/PagePlaceholder";
import {
  WatchlistTable,
  type WatchlistItemData,
} from "@/components/watchlist/WatchlistTable";

export const dynamic = "force-dynamic";

export default async function WatchlistPage() {
  const session = await auth();
  const items = await prisma.watchlistItem.findMany({
    where: { watchlist: { userId: session!.user.id } },
    orderBy: [{ sortOrder: "asc" }, { symbol: "asc" }],
    select: { id: true, symbol: true },
  });

  // Enrichissement nom + bornes 52 sem. (Finnhub, caché 24 h) — best effort
  const finnhub = getFinnhub();
  const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T | null> =>
    Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);
  const enriched: WatchlistItemData[] = await Promise.all(
    items.map(async (item) => {
      // 1,5 s max par symbole : à froid le SSR ne bloque pas sur le rate
      // limiter Finnhub ; le fetch continue en tâche de fond et remplit le
      // cache 24 h pour le rendu suivant
      const meta = finnhub
        ? await withTimeout(
            finnhub.getMeta(item.symbol).catch(() => null),
            1_500
          )
        : null;
      return {
        id: item.id,
        symbol: item.symbol,
        name: meta?.name ?? null,
        high52: meta?.high52 ?? null,
        low52: meta?.low52 ?? null,
      };
    })
  );

  return (
    <div>
      <PageTitle
        title="Watchlist"
        subtitle={`${items.length} instrument${items.length > 1 ? "s" : ""} · cotations live Finnhub (websocket, 50 symboles max) ou différées Yahoo`}
      />
      <WatchlistTable items={enriched} />
    </div>
  );
}
