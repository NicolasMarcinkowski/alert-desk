import { quoteCache } from "@/lib/marketdata/quote-cache";
import { engineStatus } from "@/lib/engine/runtime";
import {
  badRequest,
  validateAuthToken,
  unauthorized,
} from "@/lib/api/validation";

/**
 * Diagnostic : injecte une quote synthétique dans le cache — déclenche tout
 * le pipeline réel (fan-out SSE + évaluateur d'alertes). Utile pour tester
 * les alertes hors heures de marché ou sans fournisseur de données.
 * Body : { symbol: string, last: number, prevClose?: number }
 */
export async function POST(request: Request) {
  if (!validateAuthToken(request, "ADMIN_TOKEN")) return unauthorized();

  const body = await request.json().catch(() => null);
  const symbol =
    typeof body?.symbol === "string" ? body.symbol.trim().toUpperCase() : "";
  const last = Number(body?.last);
  if (!symbol || !Number.isFinite(last)) {
    return badRequest("symbol et last requis");
  }

  quoteCache.set({
    symbol,
    last,
    prevClose: Number.isFinite(Number(body?.prevClose))
      ? Number(body.prevClose)
      : undefined,
    ts: Date.now(),
    delayed: false,
    source: "inject",
  });

  return Response.json({ ok: true, engine: engineStatus() });
}
