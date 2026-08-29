import { Wordmark } from "@/components/brand/Wordmark";
import { ConnectWalletButton } from "@/components/web3/ConnectWalletButton";
import { site } from "@/config/site";

const LINKS = [
  { label: "Protocol", href: "#protocol", external: false },
  { label: "Docs", href: site.docs, external: true },
  { label: "GitHub", href: site.repo, external: true },
];

export function Navbar() {
  return (
    <header className="relative z-10 flex items-center justify-between gap-4 px-gutter pt-(--gap-nav)">
      <Wordmark />

      <nav
        aria-label="Primary"
        className="flex shrink-0 items-center gap-[clamp(1.25rem,4.69vw,4.5rem)]"
      >
        <ul className="hidden items-center gap-[clamp(1.25rem,4.69vw,4.5rem)] sm:flex">
          {LINKS.map((link) => (
            <li key={link.label}>
              <a
                href={link.href}
                {...(link.external
                  ? { target: "_blank", rel: "noreferrer noopener" }
                  : {})}
                className="text-nav text-chalk transition-opacity duration-300 hover:opacity-65"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>
        <ConnectWalletButton variant="nav" />
      </nav>
    </header>
  );
}
