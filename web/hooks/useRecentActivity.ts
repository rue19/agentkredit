"use client";

import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import type { Hex, PublicClient } from "viem";
import { useActiveChain } from "@/hooks/useActiveChain";
import { useDeployment } from "@/hooks/useDeployment";
import { fetchRecentActivity, type ActivityItem } from "@/lib/contracts/events";
import {
  disconnected,
  empty,
  failed,
  loading,
  ready,
  readErrorMessage,
  unavailable,
  unsupported,
  type DataState,
} from "@/lib/data-state";

/*
  Recent activity, straight from contract logs.

  This is deliberately shallow: one eth_getLogs per contract from the
  deployment block, no indexer, no database, no backend. If the RPC refuses
  the range the section reports the failure instead of showing a filler row.
*/
export function useRecentActivity(agentIds: Hex[] | null): DataState<ActivityItem[]> {
  const { mounted, isConnected, address, unsupported: wrongChain, walletChainId, readChainId } =
    useActiveChain();
  const { deployment, reason } = useDeployment();
  const client = usePublicClient({ chainId: readChainId });

  const enabled =
    mounted && isConnected && !wrongChain && !!deployment && !!address && !!client && !!agentIds;

  const result = useQuery({
    queryKey: ["recent-activity", readChainId, address, agentIds ?? []],
    enabled,
    queryFn: () =>
      fetchRecentActivity(client as PublicClient, deployment!, address!, agentIds ?? []),
    retry: 1,
  });

  if (!mounted) return loading;
  if (!isConnected) return disconnected;
  if (wrongChain) return unsupported(walletChainId ?? 0);
  if (!deployment) return unavailable(reason ?? "No deployment configured.");
  if (!agentIds) return loading;

  if (result.isPending) return loading;
  if (result.isError) return failed(readErrorMessage(result.error, "Could not read protocol logs."));
  if (!result.data || result.data.length === 0) return empty;

  return ready(result.data);
}
