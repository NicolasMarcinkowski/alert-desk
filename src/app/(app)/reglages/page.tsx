import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { PageTitle } from "@/components/ui/PagePlaceholder";
import {
  BrokerAccountsPanel,
  type BrokerAccountView,
} from "@/components/settings/BrokerAccountsPanel";
import {
  NotificationsPanel,
  type ChannelsState,
} from "@/components/settings/NotificationsPanel";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "ibkr", label: "Comptes" },
  { key: "notifs", label: "Notifications" },
] as const;

export default async function ReglagesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await auth();
  const { tab: tabParam } = await searchParams;
  const tab = tabParam === "notifs" ? "notifs" : "ibkr";

  return (
    <div>
      <PageTitle
        title="Réglages"
        subtitle="Comptes IBKR · notifications · allowlist (via .env)"
      />

      <div className="mb-5 flex gap-1 border-b border-edge">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/reglages?tab=${t.key}`}
            className={
              tab === t.key
                ? "border-b-2 border-accent px-3 py-2 text-sm font-medium text-accent"
                : "px-3 py-2 text-sm text-ink-soft hover:text-ink"
            }
          >
            {t.label}
          </Link>
        ))}
        <span className="px-3 py-2 text-sm text-ink-mute" title="Jalon M4">
          Préférences (M4)
        </span>
      </div>

      {tab === "ibkr" ? <IbkrTab userId={session!.user.id} /> : null}
      {tab === "notifs" ? <NotifsTab userId={session!.user.id} /> : null}
    </div>
  );
}

async function IbkrTab({ userId }: { userId: string }) {
  const accounts = await prisma.brokerAccount.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    include: { flexQueries: true },
  });

  const view: BrokerAccountView[] = accounts.map((a) => ({
    id: a.id,
    label: a.label,
    broker: a.broker,
    externalAccountId: a.externalAccountId,
    baseCurrency: a.baseCurrency,
    status: a.status,
    queries: a.flexQueries.map((q) => ({
      type: q.type,
      queryId: q.queryId,
      lastSuccessAt: q.lastSuccessAt?.toISOString() ?? null,
    })),
  }));

  return (
    <>
      <div className="mb-4 rounded-lg border border-edge-soft bg-surface-2/40 px-4 py-3 text-xs text-ink-soft">
        Le token du <span className="font-medium">Flex Web Service</span> et
        les deux Query IDs se créent dans Client Portal IBKR (Performance &
        Reports → Flex Queries). La query Activity doit inclure le champ{" "}
        <span className="font-mono">fifoPnlRealized</span> — voir le README.
        Les tokens sont chiffrés en base (AES-256-GCM).
      </div>
      <BrokerAccountsPanel accounts={view} />
    </>
  );
}

async function NotifsTab({ userId }: { userId: string }) {
  const dbChannels = await prisma.notificationChannel.findMany({
    where: { userId },
    select: { type: true },
  });
  const channels: ChannelsState = {
    telegram: {
      configured: dbChannels.some((c) => c.type === "TELEGRAM"),
      botConfigured: Boolean(process.env.TELEGRAM_BOT_TOKEN),
    },
    discord: { configured: dbChannels.some((c) => c.type === "DISCORD") },
  };
  return <NotificationsPanel channels={channels} />;
}
