"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/ui/Logo";
import {
  NAV_ANALYSE,
  NAV_SURVEILLANCE,
  isNavActive,
} from "./nav-links";

type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
};

const iconProps = {
  width: 16,
  height: 16,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const SURVEILLANCE: NavItem[] = [
  {
    href: NAV_SURVEILLANCE[0].href,
    label: NAV_SURVEILLANCE[0].label,
    icon: (
      <svg {...iconProps}>
        <rect x="3" y="3" width="7" height="9" rx="1" />
        <rect x="14" y="3" width="7" height="5" rx="1" />
        <rect x="14" y="12" width="7" height="9" rx="1" />
        <rect x="3" y="16" width="7" height="5" rx="1" />
      </svg>
    ),
  },
  {
    href: NAV_SURVEILLANCE[1].href,
    label: NAV_SURVEILLANCE[1].label,
    icon: (
      <svg {...iconProps}>
        <path d="M3 17l6-6 4 4 8-8" />
        <path d="M15 7h6v6" />
      </svg>
    ),
  },
  {
    href: NAV_SURVEILLANCE[2].href,
    label: NAV_SURVEILLANCE[2].label,
    icon: (
      <svg {...iconProps}>
        <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.7 21a2 2 0 01-3.4 0" />
      </svg>
    ),
  },
];

const ANALYSE: NavItem[] = [
  {
    href: NAV_ANALYSE[0].href,
    label: NAV_ANALYSE[0].label,
    icon: (
      <svg {...iconProps}>
        <path d="M4 4h16v16H4z" />
        <path d="M8 8h8M8 12h8M8 16h5" />
      </svg>
    ),
  },
  {
    href: NAV_ANALYSE[1].href,
    label: NAV_ANALYSE[1].label,
    icon: (
      <svg {...iconProps}>
        <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ),
  },
  {
    href: NAV_ANALYSE[2].href,
    label: NAV_ANALYSE[2].label,
    icon: (
      <svg {...iconProps}>
        <path d="M4 20V10M10 20V4M16 20v-8M22 20H2" />
      </svg>
    ),
  },
];

function NavLink({
  item,
  active,
  badge,
}: {
  item: NavItem;
  active: boolean;
  badge?: number;
}) {
  return (
    <Link
      href={item.href}
      className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
        active
          ? "bg-accent/10 font-medium text-accent"
          : "text-ink-soft hover:bg-surface-2 hover:text-ink"
      }`}
    >
      {item.icon}
      {item.label}
      {badge !== undefined && badge > 0 && (
        <span className="ml-auto rounded-full bg-accent/15 px-1.5 py-px font-mono text-[10px] font-semibold tabular-nums text-accent">
          {badge}
        </span>
      )}
    </Link>
  );
}

function NavGroup({
  title,
  items,
  pathname,
  badges,
}: {
  title: string;
  items: NavItem[];
  pathname: string;
  badges?: Record<string, number>;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="px-3 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-widest text-ink-mute">
        {title}
      </p>
      {items.map((item) => (
        <NavLink
          key={item.href}
          item={item}
          badge={badges?.[item.href]}
          active={isNavActive(item.href, pathname)}
        />
      ))}
    </div>
  );
}

export function Sidebar({ alertCount = 0 }: { alertCount?: number }) {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-edge bg-surface px-3 py-4 lg:flex">
      <div className="flex items-center gap-2.5 px-2">
        <Logo size={30} />
        <div className="leading-tight">
          <p className="text-[13px] font-bold tracking-widest">ALERT DESK</p>
          <p className="text-[10px] text-ink-mute">v0.1 · self-hosted</p>
        </div>
      </div>

      <nav className="mt-2 flex flex-1 flex-col">
        <NavGroup
          title="Surveillance"
          items={SURVEILLANCE}
          pathname={pathname}
          badges={{ "/alertes": alertCount }}
        />
        <NavGroup title="Analyse" items={ANALYSE} pathname={pathname} />
        <div className="mt-auto">
          <NavLink
            item={{
              href: "/reglages",
              label: "Réglages",
              icon: (
                <svg {...iconProps}>
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33h.01a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51h.01a1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82v.01a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" />
                </svg>
              ),
            }}
            active={pathname.startsWith("/reglages")}
          />
        </div>
      </nav>
    </aside>
  );
}
