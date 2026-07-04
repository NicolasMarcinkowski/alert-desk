import { prisma } from "@/lib/db/client";
import { STRATEGY_VALUES } from "@/lib/strategies";
import {
  badRequest,
  requireSession,
  unauthorized,
} from "@/lib/api/validation";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession();
  if (!session) return unauthorized();
  const { id } = await params;

  const trip = await prisma.roundTrip.findFirst({
    where: { id, account: { userId: session.user.id } },
    include: {
      instrument: true,
      executions: {
        orderBy: { tradeTime: "asc" },
        select: {
          id: true,
          side: true,
          quantity: true,
          price: true,
          commission: true,
          currency: true,
          tradeTime: true,
          fifoPnlRealized: true,
          confirmedByActivity: true,
          ibkrCodes: true,
          source: true,
        },
      },
    },
  });
  if (!trip) return unauthorized();

  return Response.json({ trip });
}

/** PATCH — champs journal UNIQUEMENT (le reste est calculé par la sync). */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession();
  if (!session) return unauthorized();
  const { id } = await params;

  const trip = await prisma.roundTrip.findFirst({
    where: { id, account: { userId: session.user.id } },
    select: { id: true },
  });
  if (!trip) return unauthorized();

  const body = await request.json().catch(() => null);
  if (!body) return badRequest("corps JSON attendu");

  const data: Record<string, unknown> = {};

  if ("strategy" in body) {
    const s = body.strategy;
    if (s === null || s === "") data.strategy = null;
    else if (typeof s === "string" && STRATEGY_VALUES.includes(s)) data.strategy = s;
    else return badRequest("stratégie invalide");
  }
  if ("tags" in body) {
    if (
      !Array.isArray(body.tags) ||
      body.tags.length > 10 ||
      body.tags.some((t: unknown) => typeof t !== "string" || t.length > 30)
    ) {
      return badRequest("tags invalides (max 10, 30 caractères)");
    }
    data.tags = body.tags.map((t: string) => t.trim()).filter(Boolean);
  }
  if ("notes" in body) {
    if (body.notes !== null && typeof body.notes !== "string") {
      return badRequest("notes invalides");
    }
    data.notes = body.notes ? String(body.notes).slice(0, 5000) : null;
  }
  if ("rating" in body) {
    const r = body.rating;
    if (r !== null && (!Number.isInteger(r) || r < 1 || r > 5)) {
      return badRequest("note invalide (1-5)");
    }
    data.rating = r;
  }

  await prisma.roundTrip.update({ where: { id }, data });
  return Response.json({ ok: true });
}
