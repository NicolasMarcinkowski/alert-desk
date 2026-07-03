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

export async function GET() {
  const session = await requireSession();
  if (!session) return unauthorized();

  const rules = await prisma.alertRule.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    include: {
      instrument: {
        select: {
          symbol: true,
          underlyingSymbol: true,
          expiry: true,
          strike: true,
          putCall: true,
          secType: true,
        },
      },
    },
  });
  return Response.json({ rules });
}

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
  if (!Number.isFinite(threshold)) return badRequest("seuil invalide");

  const cooldownSeconds = Number(body.cooldownSeconds) || 900;
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
    const position = await prisma.position.findFirst({
      where: { instrumentId, account: { userId: session.user.id } },
      select: { brokerAccountId: true },
    });
    if (!position) {
      return badRequest("aucune position ouverte sur cet instrument");
    }
    brokerAccountId = position.brokerAccountId;
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
