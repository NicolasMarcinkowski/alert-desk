import { prisma } from "@/lib/db/client";
import { validateAuthToken, unauthorized } from "@/lib/api/validation";
import { engineStatus } from "@/lib/engine/runtime";

export async function GET(request: Request) {
  if (!validateAuthToken(request, "ADMIN_TOKEN")) return unauthorized();

  try {
    const [accounts, executions, positions, roundTrips, lastRun] =
      await Promise.all([
        prisma.ibkrAccount.count(),
        prisma.execution.count(),
        prisma.position.count(),
        prisma.roundTrip.count(),
        prisma.syncRun.findFirst({
          orderBy: { startedAt: "desc" },
          select: { status: true, kind: true, startedAt: true, finishedAt: true },
        }),
      ]);

    return Response.json({
      ok: true,
      db: "up",
      counts: { accounts, executions, positions, roundTrips },
      lastSyncRun: lastRun,
      engine: engineStatus(),
    });
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
