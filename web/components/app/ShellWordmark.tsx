import Link from "next/link";
import { site } from "@/config/site";
import { Logo } from "@/components/brand/Logo";

/*
  The landing page's mark at application scale. Same artwork, same lockup,
  a third of the size — the shell should not restate the hero.
*/
export function ShellWordmark() {
  return (
    <Link
      href="/"
      aria-label={`${site.name} home`}
      className="flex min-w-0 items-center gap-[0.6rem] transition-opacity duration-300 hover:opacity-80"
    >
      <Logo className="h-[1.75rem] w-auto" />
      <span className="truncate text-[0.9375rem] font-medium tracking-[0.06em] text-chalk">
        {site.wordmark}
      </span>
    </Link>
  );
}
