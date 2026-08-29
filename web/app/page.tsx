import { Navbar } from "@/components/layout/Navbar";
import { Hero } from "@/components/layout/Hero";
import { Pillars } from "@/components/layout/Pillars";
import { ParticleField } from "@/components/visual/ParticleField";
import { NetworkStatusCard } from "@/components/web3/NetworkStatusCard";
import { site } from "@/config/site";

export default function LandingPage() {
  return (
    <main className="relative flex min-h-svh flex-col overflow-hidden pb-(--pad-bottom)">
      {/*
        On wide screens this is an absolutely positioned atmosphere layer
        behind everything, bleeding off the top and right edges and masked
        out to the left so it never sits under the headline. Below lg it
        falls back into the flow as a band between the hero and the pillars.
      */}
      <ParticleField className="field-mask order-2 h-[clamp(12.5rem,58vw,19rem)] w-full opacity-70 lg:absolute lg:opacity-100 lg:inset-y-0 lg:right-0 lg:left-[24%] lg:z-0 lg:order-none lg:h-auto lg:w-auto" />

      <div className="order-1 lg:order-none">
        <Navbar />
      </div>

      <div className="order-1 lg:order-none lg:flex lg:flex-1 lg:flex-col">
        <Hero />
      </div>

      <div className="relative z-10 order-3 mt-(--gap-pillars) px-gutter lg:order-none">
        <Pillars />
      </div>

      {/*
        On wide screens the status panel is pinned bottom-right exactly as in
        the reference, so it never inflates the row the pillars sit in.
      */}
      <div
        className="fade relative z-10 order-3 mt-12 w-full px-gutter lg:absolute lg:right-gutter lg:bottom-(--card-bottom) lg:order-none lg:mt-0 lg:w-auto lg:px-0"
        style={{ animationDelay: "520ms" }}
      >
        <NetworkStatusCard />
      </div>

      {/* The navbar has no room for these below sm, so they land here instead. */}
      <nav
        aria-label="Secondary"
        className="relative z-10 order-4 mt-12 flex items-center gap-8 px-gutter sm:hidden"
      >
        <a
          href="#protocol"
          className="text-fine text-faint transition-opacity duration-300 hover:opacity-65"
        >
          Protocol
        </a>
        <a
          href={site.docs}
          target="_blank"
          rel="noreferrer noopener"
          className="text-fine text-faint transition-opacity duration-300 hover:opacity-65"
        >
          Docs
        </a>
        <a
          href={site.repo}
          target="_blank"
          rel="noreferrer noopener"
          className="text-fine text-faint transition-opacity duration-300 hover:opacity-65"
        >
          GitHub
        </a>
      </nav>
    </main>
  );
}
