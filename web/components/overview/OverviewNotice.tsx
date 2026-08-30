"use client";

import { useConnect, useSwitchChain } from "wagmi";
import { ArrowRight } from "@/components/icons";
import { defaultChain } from "@/lib/chains";
import type { DataState } from "@/lib/data-state";

export type BlockedState = Extract<
  DataState<unknown>,
  { status: "disconnected" } | { status: "unsupported" } | { status: "unavailable" } | { status: "error" }
>;

/*
  One notice, in place of the whole page body.

  Disconnected, unsupported and undeployed are not three different readings
  of a wallet's position — they are the same fact, that no position can be
  read at all. Repeating it down three rows would say nothing three times, so
  the page states it once and names what it would otherwise be showing.
*/
export function OverviewNotice({ state }: { state: BlockedState }) {
  const { connect, connectors, isPending } = useConnect();
  const { switchChain, isPending: switching } = useSwitchChain();

  const copy = describe(state);

  return (
    <section className="mt-(--page-pad) border-t border-hair-soft pt-(--row-pad)">
      <p
        className={`text-label leading-none font-medium tracking-[0.13em] uppercase ${
          copy.alarm ? "text-amber" : "text-faint"
        }`}
      >
        {copy.eyebrow}
      </p>

      <p className="text-metric mt-5 max-w-[24ch] text-cream">{copy.headline}</p>
      <p className="text-fine mt-5 max-w-[52ch] leading-relaxed text-faint">{copy.body}</p>

      {state.status === "disconnected" ? (
        <button
          type="button"
          onClick={() => {
            const injected = connectors.find((c) => c.type === "injected") ?? connectors[0];
            if (injected) connect({ connector: injected });
          }}
          disabled={isPending}
          className="text-fine mt-8 flex cursor-pointer items-center gap-3 rounded-full border border-hair px-5 py-2.5 leading-none text-chalk transition-colors duration-300 hover:border-cream disabled:cursor-default"
        >
          {isPending ? "Connecting…" : "Connect wallet"}
          <ArrowRight className="size-[1.05em] text-faint" />
        </button>
      ) : null}

      {state.status === "unsupported" ? (
        <button
          type="button"
          onClick={() => switchChain({ chainId: defaultChain.id })}
          disabled={switching}
          className="text-fine mt-8 cursor-pointer rounded-full border border-hair px-5 py-2.5 leading-none text-chalk transition-colors duration-300 hover:border-cream disabled:cursor-default"
        >
          {switching ? "Switching…" : `Switch to ${defaultChain.name}`}
        </button>
      ) : null}
    </section>
  );
}

function describe(state: BlockedState): {
  eyebrow: string;
  headline: string;
  body: string;
  alarm: boolean;
} {
  switch (state.status) {
    case "disconnected":
      return {
        eyebrow: "Wallet not connected",
        headline: "There is no position to read yet.",
        body: "Identity, reputation and spending authority are all recorded against a wallet. Connect one and this page reads its state directly from the AgentKredit contracts.",
        alarm: false,
      };
    case "unsupported":
      return {
        eyebrow: "Unsupported network",
        headline: `Your wallet is on chain ${state.chainId}.`,
        body: `AgentKredit reads from ${defaultChain.name}. Nothing on this page can be resolved while the wallet is somewhere the protocol does not exist.`,
        alarm: true,
      };
    case "unavailable":
      return {
        eyebrow: "Protocol not deployed",
        headline: "Nothing to read from this network.",
        body: `${state.reason} Identity, reputation and credit authority all come from contract reads, and no figure on this page is ever simulated — so until there is a deployment there is nothing here.`,
        alarm: false,
      };
    default:
      return {
        eyebrow: "Read failed",
        headline: "The network did not answer.",
        body: state.message,
        alarm: true,
      };
  }
}
