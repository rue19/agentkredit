"use client";

import { useReadContracts } from "wagmi";
import type { Hex } from "viem";
import { useActiveChain } from "@/hooks/useActiveChain";
import { useDeployment } from "@/hooks/useDeployment";
import {
  creditRead,
  creditStatusOf,
  policyRead,
  remainingCreditRead,
  remainingDailySpendRead,
  type CreditRecord,
  type PolicyRecord,
} from "@/lib/contracts/reads";
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

export type CreditAuthority = {
  credit: CreditRecord;
  /** Null when PolicyVault has no policy for this agent — dailyLimit is 0. */
  policy: PolicyRecord | null;
};

/*
  Spending authority for one agent: the credit line CreditLine granted, and
  the daily policy PolicyVault enforces against it. Both are read straight
  from the contracts; neither is derived or estimated.
*/
export function useCreditAuthority(agentId: Hex | null): DataState<CreditAuthority> {
  const { mounted, isConnected, unsupported: wrongChain, walletChainId } = useActiveChain();
  const { deployment, reason } = useDeployment();

  const enabled = mounted && isConnected && !wrongChain && !!deployment && !!agentId;

  const result = useReadContracts({
    contracts:
      deployment && agentId
        ? [
            creditRead(deployment, agentId),
            remainingCreditRead(deployment, agentId),
            policyRead(deployment, agentId),
            remainingDailySpendRead(deployment, agentId),
          ]
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
    return failed(readErrorMessage(result.error, "Could not read the credit line."));
  }

  const [creditResult, remainingResult, policyResult, dailyResult] = result.data ?? [];
  if (creditResult?.status !== "success") {
    return failed("The credit line rejected the read.");
  }

  const [totalCredit, drawdown, rawStatus, expiry, lastProofTime] = creditResult.result;
  const status = creditStatusOf(rawStatus);
  if (status === "None") return empty;

  const credit: CreditRecord = {
    totalCredit,
    drawdown,
    remaining: remainingResult?.status === "success" ? remainingResult.result : 0n,
    status,
    expiry,
    lastProofTime,
  };

  let policy: PolicyRecord | null = null;
  if (policyResult?.status === "success") {
    const [dailyLimit, dailyUsed] = policyResult.result;
    if (dailyLimit > 0n) {
      policy = {
        dailyLimit,
        dailyUsed,
        remainingDaily:
          dailyResult?.status === "success" ? dailyResult.result : dailyLimit - dailyUsed,
      };
    }
  }

  return ready({ credit, policy });
}
