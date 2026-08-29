"use client";

import Link from "next/link";
import { adminNav, isActive, primaryNav, type NavItem } from "@/config/nav";
import { useProtocolAdmin } from "@/hooks/useProtocolAdmin";

/*
  The navigation rail's contents, shared by the desktop rail and the mobile
  sheet so the two can never drift apart.

  The active item is marked by a single 3px dot in the margin plus a shift
  from faint to cream — no pill, no fill, no colour. Destinations that do not
  exist yet are dimmed and inert rather than linking into a 404.
*/
export function NavList({
  pathname,
  onNavigate,
  size = "rail",
}: {
  pathname: string;
  onNavigate?: () => void;
  size?: "rail" | "sheet";
}) {
  /* Admin is a real Ownable permission read off the contracts, so it appears
     only once a contract has confirmed this wallet owns it. */
  const { isAdmin } = useProtocolAdmin();

  return (
    <nav aria-label="Application">
      <ul>
        {primaryNav.map((item) => (
          <li key={item.href}>
            <NavEntry
              item={item}
              active={isActive(pathname, item.href)}
              onNavigate={onNavigate}
              size={size}
            />
          </li>
        ))}
      </ul>

      {isAdmin ? (
        <>
          <hr className="my-4 w-8 border-0 border-t border-hair" />
          <ul>
            <li>
              <NavEntry
                item={adminNav}
                active={isActive(pathname, adminNav.href)}
                onNavigate={onNavigate}
                size={size}
              />
            </li>
          </ul>
        </>
      ) : null}
    </nav>
  );
}

function NavEntry({
  item,
  active,
  onNavigate,
  size,
}: {
  item: NavItem;
  active: boolean;
  onNavigate?: () => void;
  size: "rail" | "sheet";
}) {
  const scale = size === "sheet" ? "text-[1rem] py-3" : "text-rail py-[0.6rem]";
  const base = `relative block leading-none font-medium tracking-[0.14em] uppercase transition-colors duration-300 ${scale}`;

  if (!item.available) {
    return (
      <span
        aria-disabled="true"
        className={`${base} cursor-default text-dim opacity-60`}
      >
        {item.label}
        <span className="sr-only"> (not available yet)</span>
      </span>
    );
  }

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={`${base} ${active ? "text-cream" : "text-faint hover:text-chalk"}`}
    >
      {active ? (
        <span
          aria-hidden="true"
          className="absolute top-1/2 -left-[0.875rem] size-[3px] -translate-y-1/2 rounded-full bg-cream"
        />
      ) : null}
      {item.label}
    </Link>
  );
}
