import { prisma } from "@/lib/db/client";
import { requestSubscriptionRefresh } from "@/lib/engine/runtime";
import {
  badRequest,
  requireSession,
  unauthorized,
} from "@/lib/api/validation";

const PRICE_TYPES = ["PRICE_ABOVE", "PRICE_BELOW", "PCT_CHANGE_DAY"] as const;
const POSITION_TYPES = ["POSITION_PNL_ABOVE", "POSITION_PNL_BELOW"] as const;
const REARM_MODES = ["MANUAL", "AUTO_ON_RECROSS", "AUTO_AFTER_COOLDOWN"] as const;

export async function POST(request: Request) {
  const session = await requireSession();
  if (!session) return unauthorized();

  const body = await request.json().catch(() => null);
  if (!body) return badRequest("corps JSON attendu");

  const type = body.type as string;
  const isPrice = (PRICE_TYPES as readonly string[]).includes(type);
  const isPosition = (POSITION_TYPES as readonly string[]).includes(type);
  if (!isPrice && !isPosition) return badRequest("type d'alerte invalide");

  const threshold = Number(body.threshold);
  // Bornes Decimal(18,6) : au-delà, Prisma jette un 500
  if (!Number.isFinite(threshold) || Math.abs(threshold) >= 1e12) {
    return badRequest("seuil invalide");
  }

  const cooldownRaw = Number(body.cooldownSeconds);
  // Un cooldown négatif ou nul contournerait l'anti-spam du réarmement
  const cooldownSeconds = Number.isInteger(cooldownRaw)
    ? Math.min(Math.max(cooldownRaw, 60), 86_400)
    : 900;
  const rearmMode = (REARM_MODES as readonly string[]).includes(body.rearmMode)
    ? body.rearmMode
    : "AUTO_ON_RECROSS";
  const notifyTelegram = body.notifyTelegram !== false;
  const notifyDiscord = body.notifyDiscord === true;

  let symbol: string | undefined;
  let instrumentId: string | undefined;
  let brokerAccountId: string | undefined;

  if (isPrice) {
    symbol =
      typeof body.symbol === "string" ? body.symbol.trim().toUpperCase() : "";
    if (!symbol || !/^[A-Z0-9.\-]{1,12}$/.test(symbol)) {
      return badRequest("symbole invalide");
    }
  } else {
    instrumentId =
      typeof body.instrumentId === "string" ? body.instrumentId : "";
    if (!instrumentId) return badRequest("instrumentId requis");
    // L'instrument peut être détenu sur plusieurs comptes (ex. IBKR + manuel) :
    // on lie l'alerte au compte de la plus grosse position (déterministe), pas
    // à un compte arbitraire. `accountId` explicite du client prioritaire.
    const positions = await prisma.position.findMany({
      where: { instrumentId, account: { userId: session.user.id } },
      select: { brokerAccountId: true, quantity: true },
    });
    if (positions.length === 0) {
      return badRequest("aucune position ouverte sur cet instrument");
    }
    const requestedAccount =
      typeof body.brokerAccountId === "string" ? body.brokerAccountId : null;
    const chosen =
      (requestedAccount &&
        positions.find((p) => p.brokerAccountId === requestedAccount)) ||
      [...positions].sort(
        (a, b) => Math.abs(Number(b.quantity)) - Math.abs(Number(a.quantity))
      )[0];
    brokerAccountId = chosen.brokerAccountId;
  }

  const rule = await prisma.alertRule.create({
    data: {
      userId: session.user.id,
      type: type as (typeof PRICE_TYPES)[number],
      symbol,
      instrumentId,
      brokerAccountId,
      threshold: threshold.toFixed(6),
      cooldownSeconds,
      rearmMode: rearmMode as (typeof REARM_MODES)[number],
      notifyTelegram,
      notifyDiscord,
    },
    select: { id: true },
  });

  requestSubscriptionRefresh();
  return Response.json({ id: rule.id }, { status: 201 });
}
