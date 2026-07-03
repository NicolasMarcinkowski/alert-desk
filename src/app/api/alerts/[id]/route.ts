import { prisma } from "@/lib/db/client";
import { requestSubscriptionRefresh } from "@/lib/engine/runtime";
import {
  badRequest,
  requireSession,
  unauthorized,
} from "@/lib/api/validation";

async function ownedRule(userId: string, id: string) {
  return prisma.alertRule.findFirst({ where: { id, userId } });
}

/** Body : { action: "pause" | "resume" } */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession();
  if (!session) return unauthorized();
  const { id } = await params;

  const rule = await ownedRule(session.user.id, id);
  if (!rule) return unauthorized();

  const body = await request.json().catch(() => null);
  if (body?.action === "pause") {
    await prisma.alertRule.update({
      where: { id },
      data: { state: "DISABLED" },
    });
  } else if (body?.action === "resume") {
    await prisma.alertRule.update({ where: { id }, data: { state: "ARMED" } });
  } else {
    return badRequest("action invalide (pause | resume)");
  }

  requestSubscriptionRefresh();
  return Response.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession();
  if (!session) return unauthorized();
  const { id } = await params;

  const rule = await ownedRule(session.user.id, id);
  if (!rule) return unauthorized();

  await prisma.alertRule.delete({ where: { id } });
  requestSubscriptionRefresh();
  return Response.json({ ok: true });
}
