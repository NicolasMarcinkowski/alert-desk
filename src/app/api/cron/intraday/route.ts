import { runSync } from "@/lib/sync/orchestrator";
import { validateAuthToken, unauthorized } from "@/lib/api/validation";

export const maxDuration = 300;

const DEFAULT_MARKET_HOURS_UTC = "13:30-21:30";

/** Fenêtre de marché US en UTC (env MARKET_HOURS_UTC="HH:MM-HH:MM"), lun–ven. */
function isWithinMarketHours(now: Date): boolean {
  const day = now.getUTCDay();
  if (day === 0 || day === 6) return false;
  const raw = process.env.MARKET_HOURS_UTC ?? DEFAULT_MARKET_HOURS_UTC;
  const match = raw.match(/^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/);
  if (!match) return true;
  const minutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const start = Number(match[1]) * 60 + Number(match[2]);
  const end = Number(match[3]) * 60 + Number(match[4]);
  return minutes >= start && minutes <= end;
}

/** Cron NAS toutes les 15 min : import Trade Confirms (no-op hors marché). */
export async function GET(request: Request) {
  if (!validateAuthToken(request, "CRON_SECRET")) return unauthorized();

  const force = new URL(request.url).searchParams.get("force") === "true";
  if (!force && !isWithinMarketHours(new Date())) {
    return Response.json({ skipped: true, reason: "hors fenêtre de marché" });
  }

  const results = await runSync({ kind: "TRADE_CONFIRMS", trigger: "CRON" });
  return Response.json({ results });
}
