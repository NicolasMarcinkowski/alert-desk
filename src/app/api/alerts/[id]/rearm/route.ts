import { prisma } from "@/lib/db/client";
import { requestSubscriptionRefresh } from "@/lib/engine/runtime";
import { requireSession, unauthorized } from "@/lib/api/validation";

/** Réarmement manuel : TRIGGERED | COOLDOWN → ARMED. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession();
  if (!session) return unauthorized();
  const { id } = await params;

  const res = await prisma.alertRule.updateMany({
    where: {
      id,
      userId: session.user.id,
      state: { in: ["TRIGGERED", "COOLDOWN"] },
    },
    data: { state: "ARMED", rearmAt: null },
  });
  if (res.count === 0) {
    return Response.json(
      { error: "règle introuvable ou déjà armée" },
      { status: 409 }
    );
  }

  requestSubscriptionRefresh();
  return Response.json({ ok: true });
}
