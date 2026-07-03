import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { PageTitle } from "@/components/ui/PagePlaceholder";
import {
  AlertsPanel,
  type AlertEventView,
  type AlertRuleView,
  type PositionOption,
} from "@/components/alerts/AlertsPanel";
import { formatOptionName } from "@/lib/utils/format";

export const dynamic = "force-dynamic";

export default async function AlertesPage() {
  const session = await auth();
  const userId = session!.user.id;

  const [rules, events, positions, channelCount] = await Promise.all([
    prisma.alertRule.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: { instrument: true },
    }),
    prisma.alertEvent.findMany({
      where: { rule: { userId } },
      orderBy: { triggeredAt: "desc" },
      take: 20,
    }),
    prisma.position.findMany({
      where: { account: { userId } },
      include: { instrument: true },
    }),
    prisma.notificationChannel.count({ where: { userId, enabled: true } }),
  ]);

  const ruleViews: AlertRuleView[] = rules.map((r) => ({
    id: r.id,
    type: r.type,
    label: r.instrument
      ? r.instrument.secType === "OPT"
        ? formatOptionName(r.instrument)
        : r.instrument.symbol
      : (r.symbol ?? "?"),
    threshold: Number(r.threshold),
    state: r.state,
    rearmMode: r.rearmMode,
    cooldownSeconds: r.cooldownSeconds,
    lastTriggeredAt: r.lastTriggeredAt?.toISOString() ?? null,
    notifyTelegram: r.notifyTelegram,
    notifyDiscord: r.notifyDiscord,
  }));

  const eventViews: AlertEventView[] = events.map((e) => ({
    id: e.id,
    triggeredAt: e.triggeredAt.toISOString(),
    message: e.message,
    deliveries: e.deliveries as AlertEventView["deliveries"],
  }));

  const positionOptions: PositionOption[] = positions.map((p) => ({
    instrumentId: p.instrumentId,
    label:
      p.instrument.secType === "OPT"
        ? formatOptionName(p.instrument)
        : p.instrument.symbol,
  }));

  const activeCount = rules.filter((r) => r.state !== "DISABLED").length;
  const pausedCount = rules.length - activeCount;

  return (
    <div>
      <PageTitle
        title="Alertes"
        subtitle={`${activeCount} active${activeCount > 1 ? "s" : ""} · ${pausedCount} en pause · ${events.length} déclenchement${events.length > 1 ? "s" : ""} récents — évaluées côté serveur, notifie même navigateur fermé`}
      />
      <AlertsPanel
        rules={ruleViews}
        events={eventViews}
        positions={positionOptions}
        hasChannel={channelCount > 0}
      />
    </div>
  );
}
