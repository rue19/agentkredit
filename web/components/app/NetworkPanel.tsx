"use client";

import { useSwitchChain } from "wagmi";
import { useActiveChain } from "@/hooks/useActiveChain";
import { useRpcReachability } from "@/hooks/useRpcReachability";
import { useDeployment } from "@/hooks/useDeployment";
import { defaultChain } from "@/lib/chains";

/*
  Network state, at the foot of the rail.

  Three honest facts and no fourth: which chain the app is reading, whether
  its RPC answered, and whether AgentKredit is actually deployed there. A
  wallet on an unrecognised chain is named by its id and offered a switch.
*/
export function NetworkPanel({ className = "" }: { className?: string }) {
  const { mounted, unsupported, walletChainId, readChainId, readChainName } = useActiveChain();
  const { switchChain, isPending: switching } = useSwitchChain();
  const rpc = useRpcReachability(readChainId);
  const { deployment } = useDeployment();

  const networkName = !mounted
    ? defaultChain.name
    : unsupported
      ? `Chain ${walletChainId ?? "unknown"}`
      : readChainName;

  return (
    <div className={className}>
      <p className="text-label leading-none font-medium tracking-[0.13em] text-faint uppercase">
        Network
      </p>

      <div className="mt-3 flex items-center justify-between gap-3">
        <span
          className={`truncate text-[0.9375rem] ${unsupported ? "text-amber" : "text-chalk"}`}
        >
          {networkName}
        </span>
        <span
          aria-hidden="true"
          className={`size-[6px] shrink-0 rounded-full ${unsupported ? "bg-amber" : "bg-violet"}`}
        />
      </div>

      {unsupported ? (
        <>
          <p className="mt-2 text-[0.75rem] leading-snug text-faint">
            This network is not supported.
          </p>
          <button
            type="button"
            onClick={() => switchChain({ chainId: defaultChain.id })}
            disabled={switching}
            className="text-label mt-3 cursor-pointer rounded-full border border-hair px-3 py-1.5 tracking-[0.08em] text-chalk uppercase transition-colors duration-300 hover:border-cream disabled:cursor-default"
          >
            {switching ? "Switching…" : "Switch network"}
          </button>
        </>
      ) : (
        <>
          <div
            className="mt-3 flex items-center gap-2"
            title={
              rpc.blockNumber !== undefined
                ? `Latest block ${rpc.blockNumber.toString()}`
                : undefined
            }
          >
            <span
              aria-hidden="true"
              className={`size-[5px] shrink-0 rounded-full ${rpc.dot}`}
            />
            <span className={`text-[0.75rem] ${rpc.tone}`}>{rpc.label}</span>
          </div>

          <p className="mt-2 text-[0.75rem] leading-snug text-dim">
            {deployment ? "Protocol contracts configured" : "No protocol deployment"}
          </p>
        </>
      )}

    </div>
  );
}
