import { prisma } from "@/lib/db/client";
import { requireSession, unauthorized } from "@/lib/api/validation";

export async function GET() {
  const session = await requireSession();
  if (!session) return unauthorized();

  const events = await prisma.alertEvent.findMany({
    where: { rule: { userId: session.user.id } },
    orderBy: { triggeredAt: "desc" },
    take: 50,
    select: {
      id: true,
      triggeredAt: true,
      observedValue: true,
      message: true,
      deliveries: true,
      rule: { select: { id: true, type: true, symbol: true } },
    },
  });
  return Response.json({ events });
}
