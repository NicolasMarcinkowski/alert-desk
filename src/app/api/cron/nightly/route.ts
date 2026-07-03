import { runSync } from "@/lib/sync/orchestrator";
import { validateAuthToken, unauthorized } from "@/lib/api/validation";

export const maxDuration = 300;

/**
 * Cron NAS quotidien (~08h00 Paris, après génération des relevés IBKR) :
 * import Activity autoritaire + réconciliation + rebuild round-trips.
 */
export async function GET(request: Request) {
  if (!validateAuthToken(request, "CRON_SECRET")) return unauthorized();

  const results = await runSync({ kind: "ACTIVITY", trigger: "CRON" });
  return Response.json({ results });
}
