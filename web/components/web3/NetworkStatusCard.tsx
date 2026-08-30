"use client";

import { useAccount, useBlockNumber, useSwitchChain } from "wagmi";
import { defaultChain, isSupportedChain } from "@/lib/chains";
import { useMounted } from "@/hooks/useMounted";

/*
  The reference's bottom-right status panel.

  Both rows are real. NETWORK is the chain the app is actually talking to
  (the connected wallet's, or the configured default when disconnected).
  STATUS is a live reachability probe against that chain's RPC — it is not
  a protocol health claim, and there are no protocol statistics here,
  because nothing is deployed yet.
*/
export function NetworkStatusCard() {
  const mounted = useMounted();
  /*
    wagmi leaves `chain` undefined when the wallet sits on a chain that is
    not in the config, so the raw `chainId` is the only way to name it.
  */
  const { chain, chainId, isConnected } = useAccount();
  const { switchChain, isPending: switching } = useSwitchChain();

  const wrongNetwork = mounted && isConnected && !isSupportedChain(chainId);
  const probeChainId = chain && !wrongNetwork ? chain.id : defaultChain.id;

  const { data: blockNumber, isPending, isError } = useBlockNumber({
    chainId: probeChainId,
    query: { refetchInterval: 30_000, retry: 1 },
  });

  const networkName = !mounted
    ? defaultChain.name
    : wrongNetwork
      ? `Chain ${chainId}`
      : (chain?.name ?? defaultChain.name);

  const status = isPending
    ? { label: "Checking", tone: "text-faint", dot: "bg-faint pulse" }
    : isError
      ? { label: "Unreachable", tone: "text-amber", dot: "bg-amber" }
      : { label: "RPC reachable", tone: "text-chalk", dot: "bg-signal" };

  const statusTitle = isError
    ? `${defaultChain.rpcUrls.default.http[0]} did not respond`
    : blockNumber !== undefined
      ? `RPC reachable — latest block ${blockNumber.toString()}`
      : "Checking RPC reachability";

  return (
    <aside className="w-full rounded-[clamp(0.75rem,1.17vw,1.125rem)] border border-hair bg-raised p-[clamp(1.125rem,1.63vw,1.5625rem)] lg:w-[clamp(15rem,20.2vw,19.375rem)]">
      <p className="text-label leading-none font-medium tracking-[0.13em] text-faint uppercase">
        Network
      </p>
      <div className="mt-[clamp(0.5rem,0.98vw,0.9375rem)] flex items-center justify-between gap-4">
        <span
          className={`text-value truncate ${wrongNetwork ? "text-amber" : "text-chalk"}`}
        >
          {networkName}
        </span>
        <span
          aria-hidden="true"
          className={`size-[0.62em] shrink-0 rounded-full ${wrongNetwork ? "bg-amber" : "bg-violet"} text-value`}
        />
      </div>

      {wrongNetwork ? (
        <button
          type="button"
          onClick={() => switchChain({ chainId: defaultChain.id })}
          disabled={switching}
          className="text-label mt-3 cursor-pointer rounded-full border border-hair px-3 py-1.5 tracking-[0.08em] text-chalk uppercase transition-colors duration-300 hover:border-cream disabled:cursor-default"
        >
          {switching ? "Switching…" : `Switch to ${defaultChain.name}`}
        </button>
      ) : null}

      <hr className="my-[clamp(0.875rem,1.37vw,1.3125rem)] border-0 border-t border-hair-soft" />

      <p className="text-label leading-none font-medium tracking-[0.13em] text-faint uppercase">
        Status
      </p>
      <div
        className="mt-[clamp(0.5rem,0.98vw,0.9375rem)] flex items-center gap-[0.7em]"
        title={statusTitle}
      >
        <span
          aria-hidden="true"
          className={`text-value size-[0.5em] shrink-0 rounded-full ${status.dot}`}
        />
        <span className={`text-value ${status.tone}`}>{status.label}</span>
      </div>
    </aside>
  );
}
