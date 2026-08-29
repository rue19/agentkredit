/*
  The application's destinations.

  `available` is not decoration: only Overview exists today, and the rail
  refuses to link anywhere that would land on a 404. Later sprints flip these
  as the pages arrive.
*/
export type NavItem = {
  label: string;
  href: string;
  available: boolean;
};

export const primaryNav: readonly NavItem[] = [
  { label: "Overview", href: "/dashboard", available: true },
  { label: "Agents", href: "/agents", available: false },
  { label: "Credit", href: "/credit", available: false },
  { label: "Liquidity", href: "/liquidity", available: false },
  { label: "Proofs", href: "/proofs", available: false },
  { label: "Activity", href: "/activity", available: false },
] as const;

export const adminNav: NavItem = { label: "Admin", href: "/admin", available: false };

export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
