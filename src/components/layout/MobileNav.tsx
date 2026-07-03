"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const iconProps = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const ITEMS = [
  {
    href: "/",
    label: "Dashboard",
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
    href: "/positions",
    label: "Positions",
    icon: (
      <svg {...iconProps}>
        <path d="M3 17l6-6 4 4 8-8" />
        <path d="M15 7h6v6" />
      </svg>
    ),
  },
  {
    href: "/alertes",
    label: "Alertes",
    icon: (
      <svg {...iconProps}>
        <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.7 21a2 2 0 01-3.4 0" />
      </svg>
    ),
  },
  {
    href: "/journal",
    label: "Journal",
    icon: (
      <svg {...iconProps}>
        <path d="M4 4h16v16H4z" />
        <path d="M8 8h8M8 12h8M8 16h5" />
      </svg>
    ),
  },
];

const MORE_ITEMS = [
  { href: "/watchlist", label: "Watchlist" },
  { href: "/analytics", label: "Analytics" },
  { href: "/reglages", label: "Réglages" },
];

export function MobileNav({ alertCount = 0 }: { alertCount?: number }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = MORE_ITEMS.some((i) => pathname.startsWith(i.href));

  return (
    <>
      {moreOpen && (
        <div
          className="fixed inset-0 z-30 bg-bg/60 backdrop-blur-sm lg:hidden"
          onClick={() => setMoreOpen(false)}
        >
          <div
            className="absolute bottom-16 left-3 right-3 rounded-xl border border-edge bg-surface p-2 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {MORE_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMoreOpen(false)}
                className={`block rounded-lg px-4 py-3 text-sm ${
                  pathname.startsWith(item.href)
                    ? "bg-accent/10 font-medium text-accent"
                    : "text-ink-soft"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-edge bg-surface/95 backdrop-blur lg:hidden">
        {ITEMS.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] ${
                active ? "text-accent" : "text-ink-mute"
              }`}
            >
              {item.icon}
              {item.label}
              {item.href === "/alertes" && alertCount > 0 && (
                <span className="absolute right-1/2 top-1 translate-x-4 rounded-full bg-accent px-1 font-mono text-[9px] font-bold text-bg">
                  {alertCount}
                </span>
              )}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMoreOpen(!moreOpen)}
          className={`flex flex-1 cursor-pointer flex-col items-center gap-0.5 py-2 text-[10px] ${
            moreActive || moreOpen ? "text-accent" : "text-ink-mute"
          }`}
        >
          <svg {...iconProps}>
            <circle cx="5" cy="12" r="1.5" />
            <circle cx="12" cy="12" r="1.5" />
            <circle cx="19" cy="12" r="1.5" />
          </svg>
          Plus
        </button>
      </nav>
    </>
  );
}
