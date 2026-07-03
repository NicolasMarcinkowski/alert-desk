import Image from "next/image";
import { signOut } from "@/lib/auth";

type HeaderUser = {
  name?: string | null;
  email?: string | null;
  image?: string | null;
};

export function Header({ user }: { user: HeaderUser }) {
  return (
    <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-edge bg-bg/90 px-6 backdrop-blur">
      <div className="flex items-center gap-3 text-sm text-ink-soft">
        <span suppressHydrationWarning>
          {new Intl.DateTimeFormat("fr-FR", {
            dateStyle: "long",
            timeZone: "Europe/Paris",
          }).format(new Date())}
        </span>
        <span className="text-ink-mute">·</span>
        <span className="text-ink-mute">Données IBKR</span>
      </div>

      <div className="flex items-center gap-4">
        {/* Chip P&L réalisé | latent — branché au jalon M2 */}
        <div className="flex items-center gap-3 rounded-lg border border-edge bg-surface px-3 py-1.5 text-xs">
          <span className="text-ink-mute">Réalisé jour</span>
          <span className="font-mono tabular-nums text-ink-soft">—</span>
          <span className="h-3 w-px bg-edge" />
          <span className="text-ink-mute">Latent</span>
          <span className="font-mono tabular-nums text-ink-soft">—</span>
        </div>

        <button
          type="button"
          disabled
          title="Disponible après la configuration IBKR (M1)"
          className="cursor-not-allowed rounded-lg border border-edge bg-surface px-3 py-1.5 text-xs font-medium text-ink-mute"
        >
          Sync
        </button>

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
          <span className="max-w-40 truncate text-xs text-ink-soft">
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
