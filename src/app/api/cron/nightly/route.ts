import { prisma } from "@/lib/db/client";
import { runSync } from "@/lib/sync/orchestrator";
import { validateAuthToken, unauthorized } from "@/lib/api/validation";

export const maxDuration = 300;

/** Rétention des données d'exploitation volumineuses (jours). */
const RAW_RETENTION_DAYS = 30;
const SYNC_RUN_RETENTION_DAYS = 90;

/**
 * Cron NAS quotidien (~08h00 Paris, après génération des relevés IBKR) :
 * import Activity autoritaire + réconciliation + rebuild round-trips, puis
 * purge des données d'exploitation qui gonflent sans limite (le XML brut est
 * réimportable, les SyncRun sont de l'historique).
 */
export async function GET(request: Request) {
  if (!validateAuthToken(request, "CRON_SECRET")) return unauthorized();

  const results = await runSync({ kind: "ACTIVITY", trigger: "CRON" });

  const rawCutoff = new Date(
    Date.now() - RAW_RETENTION_DAYS * 24 * 60 * 60 * 1000
  );
  const runCutoff = new Date(
    Date.now() - SYNC_RUN_RETENTION_DAYS * 24 * 60 * 60 * 1000
  );
  // Garde les relevés en échec (processedOk=false) pour le debug.
  const [rawPurged, runsPurged] = await Promise.all([
    prisma.flexStatementRaw.deleteMany({
      where: { processedOk: true, fetchedAt: { lt: rawCutoff } },
    }),
    prisma.syncRun.deleteMany({
      where: { startedAt: { lt: runCutoff } },
    }),
  ]);

  return Response.json({
    results,
    purged: { rawStatements: rawPurged.count, syncRuns: runsPurged.count },
  });
}
