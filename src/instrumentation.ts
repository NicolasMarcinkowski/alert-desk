/**
 * Hook de démarrage Next.js (runtime nodejs uniquement).
 * M1 : sweep des SyncRun RUNNING orphelins après crash.
 * M2 : démarrage du moteur market data / alertes.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { sweepStaleSyncRuns } = await import("@/lib/sync/orchestrator");
  try {
    const swept = await sweepStaleSyncRuns();
    if (swept > 0) {
      console.warn(`[startup] ${swept} SyncRun orphelin(s) marqué(s) ERROR`);
    }
  } catch (e) {
    // DB potentiellement indisponible au boot (migrations en cours) — non fatal
    console.error("[startup] sweep SyncRuns impossible:", e);
  }
}
