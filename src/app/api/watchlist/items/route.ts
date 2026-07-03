import { prisma } from "@/lib/db/client";
import { fetchQuote } from "@/lib/marketdata/registry";
import { quoteCache } from "@/lib/marketdata/quote-cache";
import { requestSubscriptionRefresh } from "@/lib/engine/runtime";
import {
  badRequest,
  requireSession,
  unauthorized,
} from "@/lib/api/validation";

const DEFAULT_LIST_NAME = "Watchlist";

/** Ajout d'un ticker à la watchlist par défaut (créée à la volée). */
export async function POST(request: Request) {
  const session = await requireSession();
  if (!session) return unauthorized();

  const body = await request.json().catch(() => null);
  const symbol =
    typeof body?.symbol === "string"
      ? body.symbol.trim().toUpperCase()
      : "";
  if (!symbol || !/^[A-Z0-9.\-]{1,12}$/.test(symbol)) {
    return badRequest("symbole invalide");
  }

  // Validation : le symbole doit être coté quelque part
  const quote = await fetchQuote({ kind: "STK", symbol });
  if (!quote) {
    return badRequest(
      `Aucune cotation trouvée pour « ${symbol} » — vérifie le ticker`
    );
  }
  quoteCache.set(quote);

  const watchlist = await prisma.watchlist.upsert({
    where: {
      userId_name: { userId: session.user.id, name: DEFAULT_LIST_NAME },
    },
    create: { userId: session.user.id, name: DEFAULT_LIST_NAME },
    update: {},
  });

  try {
    const item = await prisma.watchlistItem.create({
      data: { watchlistId: watchlist.id, symbol },
    });
    requestSubscriptionRefresh();
    return Response.json({ id: item.id, symbol }, { status: 201 });
  } catch {
    return Response.json(
      { error: `${symbol} est déjà dans la watchlist` },
      { status: 409 }
    );
  }
}
