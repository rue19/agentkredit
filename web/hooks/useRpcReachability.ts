"use client";

import { useBlockNumber } from "wagmi";
import type { SupportedChainId } from "@/lib/chains";

export type RpcReachability = {
  label: "Checking" | "RPC reachable" | "RPC unreachable";
  tone: string;
  dot: string;
  blockNumber: bigint | undefined;
};

/*
  A live reachability probe against one chain's RPC.

  This is a connectivity fact and nothing more: it says the node answered,
  not that AgentKredit is healthy. The wording is deliberately literal.
*/
export function useRpcReachability(chainId: SupportedChainId): RpcReachability {
  const { data, isPending, isError } = useBlockNumber({
    chainId,
    query: { refetchInterval: 30_000, retry: 1 },
  });

  if (isPending) {
    return { label: "Checking", tone: "text-faint", dot: "bg-faint pulse", blockNumber: undefined };
  }
  if (isError) {
    return { label: "RPC unreachable", tone: "text-amber", dot: "bg-amber", blockNumber: undefined };
  }
  return { label: "RPC reachable", tone: "text-muted", dot: "bg-signal", blockNumber: data };
}
