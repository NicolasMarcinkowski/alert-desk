import { prisma } from "@/lib/db/client";
import { requestSubscriptionRefresh } from "@/lib/engine/runtime";
import { requireSession, unauthorized } from "@/lib/api/validation";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession();
  if (!session) return unauthorized();
  const { id } = await params;

  const item = await prisma.watchlistItem.findFirst({
    where: { id, watchlist: { userId: session.user.id } },
  });
  if (!item) return unauthorized();

  await prisma.watchlistItem.delete({ where: { id } });
  requestSubscriptionRefresh();
  return Response.json({ ok: true });
}
