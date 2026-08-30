"use client";

import { usePathname } from "next/navigation";
import { MobileNav } from "@/components/app/MobileNav";
import { NavList } from "@/components/app/NavList";
import { NetworkPanel } from "@/components/app/NetworkPanel";
import { ShellWordmark } from "@/components/app/ShellWordmark";
import { WalletControl } from "@/components/app/WalletControl";

/*
  The authenticated shell.

  A header hairline across the top carrying the mark and the wallet, then a
  navigation rail down the left and the page beside it. On wide screens the
  rail is fixed and only the page scrolls; below lg the rail is replaced by
  a sheet and the document scrolls normally.
*/
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-svh flex-col lg:h-svh lg:overflow-hidden">
      <header className="flex h-(--shell-head) shrink-0 items-center justify-between gap-4 border-b border-hair-soft px-gutter">
        <ShellWordmark />
        <div className="flex items-center gap-3">
          <WalletControl className="hidden sm:block" />
          <MobileNav />
        </div>
      </header>

      <div className="flex flex-1 lg:min-h-0">
        <aside className="hidden w-rail shrink-0 flex-col border-r border-hair-soft py-(--page-pad) pr-6 pl-gutter lg:flex">
          <NavList pathname={pathname} />
          <NetworkPanel className="mt-auto pt-10" />
        </aside>

        <main className="min-w-0 flex-1 lg:overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
