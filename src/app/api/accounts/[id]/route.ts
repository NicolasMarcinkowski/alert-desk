import { prisma } from "@/lib/db/client";
import { seal } from "@/lib/crypto";
import {
  badRequest,
  requireSession,
  unauthorized,
} from "@/lib/api/validation";

async function ownedAccount(userId: string, id: string) {
  return prisma.ibkrAccount.findFirst({ where: { id, userId } });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession();
  if (!session) return unauthorized();
  const { id } = await params;

  const account = await ownedAccount(session.user.id, id);
  if (!account) return unauthorized();

  const body = await request.json().catch(() => null);
  if (!body) return badRequest("corps JSON attendu");

  const data: Record<string, unknown> = {};
  if (typeof body.label === "string" && body.label.trim()) {
    data.label = body.label.trim();
  }
  if (typeof body.flexToken === "string" && body.flexToken.trim()) {
    data.flexTokenEncrypted = seal(body.flexToken.trim());
    data.status = "ACTIVE"; // nouveau token → on retente
  }
  if (body.status === "DISABLED" || body.status === "ACTIVE") {
    data.status = body.status;
  }

  await prisma.ibkrAccount.update({ where: { id }, data });

  // Mise à jour des query IDs (remplacement par type)
  for (const [key, type] of [
    ["queryIdTradeConfirms", "TRADE_CONFIRMS"],
    ["queryIdActivity", "ACTIVITY"],
  ] as const) {
    const value = body[key];
    if (typeof value !== "string") continue;
    await prisma.flexQuery.deleteMany({
      where: { ibkrAccountId: id, type },
    });
    if (value.trim()) {
      await prisma.flexQuery.create({
        data: { ibkrAccountId: id, queryId: value.trim(), type },
      });
    }
  }

  return Response.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession();
  if (!session) return unauthorized();
  const { id } = await params;

  const account = await ownedAccount(session.user.id, id);
  if (!account) return unauthorized();

  await prisma.ibkrAccount.delete({ where: { id } });
  return Response.json({ ok: true });
}
