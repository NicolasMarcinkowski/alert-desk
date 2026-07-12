import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { PageTitle } from "@/components/ui/PagePlaceholder";
import {
  ConnectorsPanel,
  type ConnectorAccountView,
} from "@/components/settings/ConnectorsPanel";
import {
  NotificationsPanel,
  type ChannelsState,
} from "@/components/settings/NotificationsPanel";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "connecteurs", label: "Connecteurs" },
  { key: "notifs", label: "Notifications" },
  { key: "allowlist", label: "Allowlist" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default async function ReglagesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await auth();
  const { tab: tabParam } = await searchParams;
  const tab: TabKey =
    tabParam === "notifs" || tabParam === "allowlist"
      ? tabParam
      : "connecteurs";

  return (
    <div>
      <PageTitle
        title="Réglages"
        subtitle="Connecteurs de plateformes · notifications · accès"
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
      </div>

      {tab === "connecteurs" ? (
        <ConnectorsTab userId={session!.user.id} />
      ) : null}
      {tab === "notifs" ? <NotifsTab userId={session!.user.id} /> : null}
      {tab === "allowlist" ? <AllowlistTab /> : null}
    </div>
  );
}

async function ConnectorsTab({ userId }: { userId: string }) {
  const accounts = await prisma.brokerAccount.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    include: { flexQueries: true },
  });

  const view: ConnectorAccountView[] = accounts.map((a) => ({
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

  return <ConnectorsPanel accounts={view} />;
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

function AllowlistTab() {
  const emails = (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  return (
    <div className="flex max-w-140 flex-col gap-3.5 rounded-xl border border-edge bg-surface p-4">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-semibold">
          Emails autorisés (Google OAuth)
        </span>
        <span className="text-xs text-ink-mute">
          Seuls ces comptes peuvent se connecter — toute autre adresse est
          refusée, et une liste vide bloque tout le monde.
        </span>
      </div>
      {emails.map((email) => (
        <div
          key={email}
          className="flex items-center gap-2.5 rounded-lg border border-edge-soft bg-surface-2/50 px-3 py-2.5"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-gain"
          >
            <path d="M20 6L9 17l-5-5" />
          </svg>
          <span className="font-mono text-sm">{email}</span>
        </div>
      ))}
      {emails.length === 0 && (
        <p className="rounded-lg border border-loss/30 bg-loss/10 px-3 py-2 text-sm text-loss">
          Aucun email autorisé — personne ne peut se connecter.
        </p>
      )}
      <p className="text-xs leading-relaxed text-ink-mute">
        Cette liste est gérée par la variable{" "}
        <span className="font-mono text-ink-soft">ALLOWED_EMAILS</span> du
        serveur (fichier <span className="font-mono text-ink-soft">.env</span>
        ) : la modifier ici serait moins sûr qu&apos;un accès au serveur.
        Retirer un email révoque sa session immédiatement.
      </p>
    </div>
  );
}
