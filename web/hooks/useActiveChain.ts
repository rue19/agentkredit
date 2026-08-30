"use client";

import { useAccount } from "wagmi";
import { useMounted } from "@/hooks/useMounted";
import {
  defaultChain,
  isSupportedChain,
  supportedChains,
  type SupportedChainId,
} from "@/lib/chains";

export type ActiveChain = {
  /** False until hydration completes; wallet state does not exist before then. */
  mounted: boolean;
  isConnected: boolean;
  address: `0x${string}` | undefined;
  /** The wallet's chain, whether or not the app supports it. */
  walletChainId: number | undefined;
  /** True when a wallet is connected to a chain the app has no config for. */
  unsupported: boolean;
  /** The chain reads are actually issued against. */
  readChainId: SupportedChainId;
  readChainName: string;
};

/*
  One answer to "which chain are we talking about", shared by every hook and
  by the shell. Reads fall back to the default chain when no wallet is
  connected, and stop entirely when the wallet is somewhere unsupported.
*/
export function useActiveChain(): ActiveChain {
  const mounted = useMounted();
  const { address, chainId, isConnected } = useAccount();

  const connected = mounted && isConnected;
  /* Null whenever the wallet sits on a chain the app has no config for. */
  const supported = isSupportedChain(chainId) ? chainId : null;
  const unsupported = connected && supported === null;
  const readChainId = connected && supported !== null ? supported : defaultChain.id;
  const readChainName =
    supportedChains.find((c) => c.id === readChainId)?.name ?? defaultChain.name;

  return {
    mounted,
    isConnected: connected,
    address: connected ? address : undefined,
    walletChainId: mounted ? chainId : undefined,
    unsupported,
    readChainId,
    readChainName,
  };
}
