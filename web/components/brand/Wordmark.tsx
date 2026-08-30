import Link from "next/link";
import { site } from "@/config/site";
import { Logo } from "./Logo";

export function Wordmark() {
  return (
    <Link
      href="/"
      aria-label={`${site.name} home`}
      className="flex min-w-0 shrink items-center gap-[clamp(0.5rem,1.17vw,1.125rem)] transition-opacity duration-300 hover:opacity-80"
    >
      <Logo className="h-[clamp(2.125rem,4.63vw,4.4375rem)] w-auto" />
      <span className="text-wordmark truncate font-medium tracking-[0.05em] text-chalk">
        {site.wordmark}
      </span>
    </Link>
  );
}
