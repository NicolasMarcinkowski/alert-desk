import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { PageTitle } from "@/components/ui/PagePlaceholder";
import {
  IbkrAccountsPanel,
  type IbkrAccountView,
} from "@/components/settings/IbkrAccountsPanel";

export default async function ReglagesPage() {
  const session = await auth();
  const accounts = await prisma.ibkrAccount.findMany({
    where: { userId: session!.user.id },
    orderBy: { createdAt: "asc" },
    include: { flexQueries: true },
  });

  const view: IbkrAccountView[] = accounts.map((a) => ({
    id: a.id,
    label: a.label,
    ibkrAccountId: a.ibkrAccountId,
    baseCurrency: a.baseCurrency,
    status: a.status,
    queries: a.flexQueries.map((q) => ({
      type: q.type,
      queryId: q.queryId,
      lastSuccessAt: q.lastSuccessAt?.toISOString() ?? null,
    })),
  }));

  return (
    <div>
      <PageTitle
        title="Réglages"
        subtitle="Comptes IBKR · notifications · préférences · allowlist"
      />

      <div className="mb-5 flex gap-1 border-b border-edge">
        <span className="border-b-2 border-accent px-3 py-2 text-sm font-medium text-accent">
          IBKR
        </span>
        {["Notifications (M3)", "Préférences (M4)", "Allowlist (env)"].map(
          (label) => (
            <span
              key={label}
              className="px-3 py-2 text-sm text-ink-mute"
              title="À venir"
            >
              {label}
            </span>
          )
        )}
      </div>

      <div className="mb-4 rounded-lg border border-edge-soft bg-surface-2/40 px-4 py-3 text-xs text-ink-soft">
        Le token du <span className="font-medium">Flex Web Service</span> et
        les deux Query IDs se créent dans Client Portal IBKR (Performance &
        Reports → Flex Queries). La query Activity doit inclure le champ{" "}
        <span className="font-mono">fifoPnlRealized</span> — voir le README.
        Les tokens sont chiffrés en base (AES-256-GCM).
      </div>

      <IbkrAccountsPanel accounts={view} />
    </div>
  );
}
