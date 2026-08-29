"use client";

import { useQuery } from "@tanstack/react-query";
import { usePublicClient, useReadContracts } from "wagmi";
import type { Hex, PublicClient } from "viem";
import { useActiveChain } from "@/hooks/useActiveChain";
import { useDeployment } from "@/hooks/useDeployment";
import { fetchAgentIdsForOperator } from "@/lib/contracts/events";
import { agentRead, type AgentRecord } from "@/lib/contracts/reads";
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

export type AgentIdentity = {
  agents: AgentRecord[];
  /** The agent the Overview speaks for: the first active one, else the first. */
  primary: AgentRecord | null;
};

/*
  Does this wallet have an agent identity?

  AgentRegistry is keyed by agentId and has no operator index, so this is a
  two-step read: the AgentRegistered log tells us which agentIds belong to
  the wallet, then getAgent tells us their current state.
*/
export function useAgentIdentity(): DataState<AgentIdentity> {
  const { mounted, isConnected, address, unsupported: wrongChain, walletChainId, readChainId } =
    useActiveChain();
  const { deployment, reason } = useDeployment();
  const client = usePublicClient({ chainId: readChainId });

  const canQuery = mounted && isConnected && !wrongChain && !!deployment && !!address && !!client;

  const ids = useQuery({
    queryKey: ["agent-ids", readChainId, deployment?.addresses.agentRegistry, address],
    enabled: canQuery,
    queryFn: () =>
      fetchAgentIdsForOperator(client as PublicClient, deployment!, address!),
    retry: 1,
  });

  const agentIds: Hex[] = ids.data ?? [];

  const records = useReadContracts({
    contracts: deployment ? agentIds.map((id) => agentRead(deployment, id)) : [],
    query: { enabled: canQuery && agentIds.length > 0 },
  });

  if (!mounted) return loading;
  if (!isConnected) return disconnected;
  if (wrongChain) return unsupported(walletChainId ?? 0);
  if (!deployment) return unavailable(reason ?? "No deployment configured.");

  if (ids.isPending) return loading;
  if (ids.isError) return failed(readErrorMessage(ids.error, "Could not read the agent registry."));
  if (agentIds.length === 0) return empty;

  if (records.isPending) return loading;
  if (records.isError) {
    return failed(readErrorMessage(records.error, "Could not read the agent registry."));
  }

  const agents: AgentRecord[] = [];
  for (const [index, result] of (records.data ?? []).entries()) {
    if (result.status !== "success") continue;
    const agent = result.result;
    agents.push({
      agentId: agentIds[index],
      operator: agent.operator,
      bondAmount: agent.bondAmount,
      createdAt: BigInt(agent.createdAt),
      active: agent.active,
    });
  }

  if (agents.length === 0) return empty;

  return ready({
    agents,
    primary: agents.find((agent) => agent.active) ?? agents[0],
  });
}
