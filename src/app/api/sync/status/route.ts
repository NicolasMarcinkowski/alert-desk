import { prisma } from "@/lib/db/client";
import { requireSession, unauthorized } from "@/lib/api/validation";

export async function GET() {
  const session = await requireSession();
  if (!session) return unauthorized();

  const accountIds = (
    await prisma.ibkrAccount.findMany({
      where: { userId: session.user.id },
      select: { id: true },
    })
  ).map((a) => a.id);

  const runs = await prisma.syncRun.findMany({
    where: { ibkrAccountId: { in: accountIds } },
    orderBy: { startedAt: "desc" },
    take: 20,
    select: {
      id: true,
      ibkrAccountId: true,
      kind: true,
      trigger: true,
      status: true,
      startedAt: true,
      finishedAt: true,
      itemsFetched: true,
      itemsInserted: true,
      itemsUpdated: true,
      duplicates: true,
      errors: true,
    },
  });

  const lastSuccess = await prisma.syncRun.findFirst({
    where: { ibkrAccountId: { in: accountIds }, status: "SUCCESS" },
    orderBy: { finishedAt: "desc" },
    select: { finishedAt: true, kind: true },
  });

  return Response.json({ runs, lastSuccess });
}
