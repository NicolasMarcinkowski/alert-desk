/** Routes et libellés de navigation — source unique pour Sidebar et MobileNav. */

export const NAV_SURVEILLANCE = [
  { href: "/", label: "Dashboard" },
  { href: "/positions", label: "Positions" },
  { href: "/alertes", label: "Alertes" },
] as const;

export const NAV_ANALYSE = [
  { href: "/journal", label: "Journal" },
  { href: "/watchlist", label: "Watchlist" },
  { href: "/analytics", label: "Analytics" },
] as const;

export const NAV_MOBILE_MORE = [
  { href: "/watchlist", label: "Watchlist" },
  { href: "/analytics", label: "Analytics" },
  { href: "/reglages", label: "Réglages" },
] as const;

export function isNavActive(href: string, pathname: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}
