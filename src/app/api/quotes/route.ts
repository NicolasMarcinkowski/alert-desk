import { requireSession, unauthorized } from "@/lib/api/validation";
import { quoteCache } from "@/lib/marketdata/quote-cache";

export const dynamic = "force-dynamic";

/** Snapshot REST du cache de quotes (rendu initial / fallback SSE). */
export async function GET(request: Request) {
  const session = await requireSession();
  if (!session) return unauthorized();

  const symbolsParam = new URL(request.url).searchParams.get("symbols");
  const all = quoteCache.snapshot();
  if (!symbolsParam) return Response.json({ quotes: all });

  const wanted = new Set(
    symbolsParam.split(",").map((s) => s.trim().toUpperCase())
  );
  return Response.json({
    quotes: all.filter((q) => wanted.has(q.symbol.toUpperCase())),
  });
}
