import { FlexError, validateFlexQuery } from "@/lib/flex/client";
import {
  badRequest,
  requireSession,
  unauthorized,
} from "@/lib/api/validation";

/**
 * Dry-run SendRequest sur des credentials non persistés — utilisé par le
 * wizard de connexion IBKR (étape Vérification) avant la création du compte.
 * Le token n'est jamais stocké ici ; il ne transite qu'en mémoire.
 */
export async function POST(request: Request) {
  const session = await requireSession();
  if (!session) return unauthorized();

  const body = await request.json().catch(() => null);
  const flexToken =
    typeof body?.flexToken === "string" ? body.flexToken.trim() : "";
  const queryIdTradeConfirms =
    typeof body?.queryIdTradeConfirms === "string"
      ? body.queryIdTradeConfirms.trim()
      : "";
  const queryIdActivity =
    typeof body?.queryIdActivity === "string" ? body.queryIdActivity.trim() : "";

  if (!flexToken) return badRequest("flexToken requis");
  if (!queryIdTradeConfirms && !queryIdActivity) {
    return badRequest("au moins un query ID requis");
  }

  const queries = [
    ...(queryIdTradeConfirms
      ? [{ queryId: queryIdTradeConfirms, type: "TRADE_CONFIRMS" }]
      : []),
    ...(queryIdActivity
      ? [{ queryId: queryIdActivity, type: "ACTIVITY" }]
      : []),
  ];

  const results: {
    queryId: string;
    type: string;
    ok: boolean;
    error?: string;
    authError?: boolean;
  }[] = [];

  for (const query of queries) {
    try {
      await validateFlexQuery(flexToken, query.queryId);
      results.push({ queryId: query.queryId, type: query.type, ok: true });
    } catch (e) {
      results.push({
        queryId: query.queryId,
        type: query.type,
        ok: false,
        error: e instanceof Error ? e.message : String(e),
        authError: e instanceof FlexError && e.kind === "AUTH",
      });
    }
  }

  return Response.json({
    ok: results.every((r) => r.ok),
    results,
  });
}
