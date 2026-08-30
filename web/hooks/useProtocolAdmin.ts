"use client";

import { useReadContracts } from "wagmi";
import { useActiveChain } from "@/hooks/useActiveChain";
import { useDeployment } from "@/hooks/useDeployment";
import { ownerReads } from "@/lib/contracts/reads";

/*
  Whether the connected wallet administers the protocol.

  There is no permission model beyond OpenZeppelin Ownable, so this asks the
  contracts directly: a wallet is an admin exactly when it owns at least one
  of them. Nothing is assumed while the answer is still unknown — the Admin
  destination stays hidden until a contract has actually said yes.
*/
export function useProtocolAdmin(): { isAdmin: boolean; isResolved: boolean } {
  const { mounted, isConnected, address, unsupported } = useActiveChain();
  const { deployment } = useDeployment();

  const enabled = mounted && isConnected && !unsupported && !!deployment && !!address;

  const result = useReadContracts({
    contracts: deployment ? ownerReads(deployment) : [],
    query: { enabled, staleTime: 5 * 60_000 },
  });

  if (!enabled || result.isPending || result.isError) {
    return { isAdmin: false, isResolved: false };
  }

  const owners = (result.data ?? [])
    .filter((entry) => entry.status === "success")
    .map((entry) => String(entry.result).toLowerCase());

  return {
    isAdmin: owners.includes(address!.toLowerCase()),
    isResolved: true,
  };
}
