import { runSync, type SyncKindInput } from "@/lib/sync/orchestrator";
import {
  badRequest,
  requireSession,
  unauthorized,
} from "@/lib/api/validation";

export const maxDuration = 300;

/**
 * Sync manuelle (« Sync now ») — restreinte aux comptes de l'utilisateur.
 * Body optionnel : { accountId?, kind?: "TRADE_CONFIRMS"|"ACTIVITY"|"ALL" }
 */
export async function POST(request: Request) {
  const session = await requireSession();
  if (!session) return unauthorized();

  const body = await request.json().catch(() => ({}));
  const accountId =
    typeof body?.accountId === "string" ? body.accountId : undefined;
  const kindInput = body?.kind ?? "ALL";
  if (!["TRADE_CONFIRMS", "ACTIVITY", "ALL"].includes(kindInput)) {
    return badRequest("kind invalide");
  }

  const kinds: SyncKindInput[] =
    kindInput === "ALL" ? ["TRADE_CONFIRMS", "ACTIVITY"] : [kindInput];

  const results = [];
  for (const kind of kinds) {
    results.push(
      ...(await runSync({
        ibkrAccountId: accountId,
        userId: session.user.id,
        kind,
        trigger: "MANUAL",
      }))
    );
  }

  return Response.json({ results });
}
