import { EyebrowPill } from "@/components/primitives/EyebrowPill";
import { ConnectWalletButton } from "@/components/web3/ConnectWalletButton";
import { ShieldCheck } from "@/components/icons";

export function Hero() {
  return (
    <div className="relative z-10 px-gutter">
      <div className="rise mt-(--gap-eyebrow)" style={{ animationDelay: "60ms" }}>
        <EyebrowPill>On-chain credit infrastructure</EyebrowPill>
      </div>

      <h1
        className="rise text-display mt-(--gap-head) text-cream"
        style={{ animationDelay: "120ms" }}
      >
        Credit
        <br />
        for agents.
      </h1>

      <p
        className="rise text-lede mt-(--gap-lede) max-w-[44ch] text-muted"
        style={{ animationDelay: "200ms" }}
      >
        AgentKredit gives autonomous agents programmable
        <br className="hidden sm:inline" /> spending authority backed by
        reputation.
      </p>

      <div className="rise mt-(--gap-cta)" style={{ animationDelay: "280ms" }}>
        <ConnectWalletButton variant="hero" />
      </div>

      <p
        className="rise text-fine mt-(--gap-fine) flex items-center gap-[0.85em] text-dim"
        style={{ animationDelay: "360ms" }}
      >
        <ShieldCheck className="size-[1.45em] shrink-0" />
        Secure. Transparent. On-chain.
      </p>
    </div>
  );
}
