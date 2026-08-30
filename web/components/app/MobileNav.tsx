"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Close, MenuLines } from "@/components/icons";
import { NavList } from "@/components/app/NavList";
import { NetworkPanel } from "@/components/app/NetworkPanel";
import { WalletControl } from "@/components/app/WalletControl";

/*
  Mobile navigation.

  Not a shrunken rail: a full-height sheet on the same black ground, with the
  navigation set at reading size and the wallet and network state — which
  live at the foot of the desktop rail — carried along with it.
*/
export function MobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  /* Close on navigation. */
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open navigation"
        aria-expanded={open}
        className="flex size-9 cursor-pointer items-center justify-center rounded-full border border-hair text-chalk transition-colors duration-300 hover:border-cream lg:hidden"
      >
        <MenuLines className="size-[1.1rem]" />
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Navigation"
          /* A quick fade, not the landing page's slow one: the sheet is
             opaque and must cover the page well before it is read. */
          style={{ animationDuration: "180ms" }}
          className="fade fixed inset-0 z-50 flex flex-col overflow-y-auto bg-ground lg:hidden"
        >
          <div className="flex h-(--shell-head) shrink-0 items-center justify-between px-gutter">
            <p className="text-label leading-none font-medium tracking-[0.13em] text-faint uppercase">
              Menu
            </p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close navigation"
              className="flex size-9 cursor-pointer items-center justify-center rounded-full border border-hair text-chalk transition-colors duration-300 hover:border-cream"
            >
              <Close className="size-[1.1rem]" />
            </button>
          </div>

          <div className="px-gutter pt-6 pb-12">
            <NavList pathname={pathname} size="sheet" onNavigate={() => setOpen(false)} />

            <hr className="my-8 border-0 border-t border-hair-soft" />

            <WalletControl className="inline-block" />

            <NetworkPanel className="mt-8" />
          </div>
        </div>
      ) : null}
    </>
  );
}
