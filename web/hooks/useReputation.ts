"use client";

import { useReadContracts } from "wagmi";
import type { Hex } from "viem";
import { useActiveChain } from "@/hooks/useActiveChain";
import { useDeployment } from "@/hooks/useDeployment";
import { reputationRead, tierRead, type ReputationRecord } from "@/lib/contracts/reads";
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

export type Reputation = ReputationRecord & { tier: number };

/*
  Reputation for one agent. An agent with no attestations has lastUpdate 0,
  which is genuinely "nothing recorded" rather than a score of zero — the
  two are reported differently.
*/
export function useReputation(agentId: Hex | null): DataState<Reputation> {
  const { mounted, isConnected, unsupported: wrongChain, walletChainId } = useActiveChain();
  const { deployment, reason } = useDeployment();

  const enabled = mounted && isConnected && !wrongChain && !!deployment && !!agentId;

  const result = useReadContracts({
    contracts:
      deployment && agentId
        ? [reputationRead(deployment, agentId), tierRead(deployment, agentId)]
        : [],
    query: { enabled },
  });

  if (!mounted) return loading;
  if (!isConnected) return disconnected;
  if (wrongChain) return unsupported(walletChainId ?? 0);
  if (!deployment) return unavailable(reason ?? "No deployment configured.");
  if (!agentId) return empty;

  if (result.isPending) return loading;
  if (result.isError) {
    return failed(readErrorMessage(result.error, "Could not read the reputation registry."));
  }

  const [reputationResult, tierResult] = result.data ?? [];
  if (reputationResult?.status !== "success" || tierResult?.status !== "success") {
    return failed("The reputation registry rejected the read.");
  }

  const record = reputationResult.result;
  if (record.lastUpdate === 0n) return empty;

  return ready({
    score: record.score,
    totalActions: record.totalActions,
    positiveActions: record.positiveActions,
    negativeActions: record.negativeActions,
    commitmentRoot: record.commitmentRoot,
    lastUpdate: BigInt(record.lastUpdate),
    tier: tierResult.result,
  });
}
