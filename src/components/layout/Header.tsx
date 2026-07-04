import Image from "next/image";
import { signOut } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { getHeaderStats } from "@/lib/db/queries";
import { SyncButton } from "./SyncButton";
import { LivePnlChip } from "./LivePnlChip";

type HeaderUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
};

export async function Header({ user }: { user: HeaderUser }) {
  const [linkedAccountCount, lastSuccess, stats] = await Promise.all([
    prisma.brokerAccount.count({ where: { userId: user.id, broker: "IBKR" } }),
    prisma.syncRun.findFirst({
      where: { status: "SUCCESS", account: { userId: user.id } },
      orderBy: { finishedAt: "desc" },
      select: { finishedAt: true },
    }),
    getHeaderStats(user.id),
  ]);

  return (
    <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-edge bg-bg/90 px-6 backdrop-blur">
      <div className="hidden items-center gap-3 text-sm text-ink-soft md:flex">
        <span suppressHydrationWarning>
          {new Intl.DateTimeFormat("fr-FR", {
            dateStyle: "long",
            timeZone: "Europe/Paris",
          }).format(new Date())}
        </span>
        <span className="text-ink-mute">·</span>
        <span className="text-ink-mute">
          {lastSuccess?.finishedAt
            ? `Dernière sync ${new Intl.DateTimeFormat("fr-FR", {
                timeStyle: "short",
                timeZone: "Europe/Paris",
              }).format(lastSuccess.finishedAt)}`
            : "Aucune sync broker"}
        </span>
      </div>

      <div className="flex items-center gap-4">
        <LivePnlChip
          realizedToday={stats.realizedTodayBase}
          executionsToday={stats.executionsToday}
          positions={stats.positions}
          currency={stats.baseCurrency}
        />

        <SyncButton disabled={linkedAccountCount === 0} />

        <div className="flex items-center gap-2.5 border-l border-edge pl-4">
          {user.image ? (
            <Image
              src={user.image}
              alt=""
              width={26}
              height={26}
              className="rounded-full"
            />
          ) : (
            <div className="flex size-6.5 items-center justify-center rounded-full bg-surface-2 text-xs font-semibold text-ink-soft">
              {(user.name ?? user.email ?? "?").charAt(0).toUpperCase()}
            </div>
          )}
          <span className="hidden max-w-40 truncate text-xs text-ink-soft sm:inline">
            {user.email}
          </span>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button
              type="submit"
              title="Déconnexion"
              className="cursor-pointer rounded-md p-1 text-ink-mute transition-colors hover:bg-surface-2 hover:text-ink"
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
                <path d="M16 17l5-5-5-5M21 12H9" />
              </svg>
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
