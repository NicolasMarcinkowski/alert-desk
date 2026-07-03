import { prisma } from "@/lib/db/client";
import { processStatementXml } from "@/lib/sync/orchestrator";
import {
  badRequest,
  validateAuthToken,
  unauthorized,
} from "@/lib/api/validation";

export const maxDuration = 300;

/**
 * Import manuel d'un relevé Flex XML (backfill : IBKR permet de télécharger
 * jusqu'à 365 jours d'historique depuis Client Portal).
 * Body JSON : { accountId: string (id interne), xml: string, source?: "ACTIVITY"|"TRADE_CONFIRMS" }
 */
export async function POST(request: Request) {
  if (!validateAuthToken(request, "ADMIN_TOKEN")) return unauthorized();

  const body = await request.json().catch(() => null);
  const accountId =
    typeof body?.accountId === "string" ? body.accountId : undefined;
  const xml = typeof body?.xml === "string" ? body.xml : undefined;
  const source = body?.source === "TRADE_CONFIRMS" ? "TRADE_CONFIRMS" : "ACTIVITY";

  if (!accountId || !xml) return badRequest("accountId et xml requis");

  const account = await prisma.brokerAccount.findUnique({
    where: { id: accountId },
  });
  if (!account) return badRequest("compte inconnu");

  try {
    const result = await processStatementXml(
      accountId,
      "manual",
      `manual-${Date.now()}`,
      xml,
      source
    );
    return Response.json(result);
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 422 }
    );
  }
}
