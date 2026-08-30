import type { Address, Hex } from "viem";
import {
  agentRegistryAbi,
  creditLineAbi,
  policyVaultAbi,
  reputationRegistryAbi,
  ownableAbi,
} from "@/lib/abis";
import { CONTRACT_NAMES, type Deployment } from "@/config/contracts";

/*
  Contract read layer.

  These build wagmi/viem call descriptors — they do not fetch. Hooks own the
  fetching, components own the rendering, and nothing above this file ever
  names an ABI or an address.
*/

export function agentRead(deployment: Deployment, agentId: Hex) {
  return {
    address: deployment.addresses.agentRegistry,
    abi: agentRegistryAbi,
    functionName: "getAgent",
    args: [agentId],
  } as const;
}

export function reputationRead(deployment: Deployment, agentId: Hex) {
  return {
    address: deployment.addresses.reputationRegistry,
    abi: reputationRegistryAbi,
    functionName: "getReputation",
    args: [agentId],
  } as const;
}

export function tierRead(deployment: Deployment, agentId: Hex) {
  return {
    address: deployment.addresses.reputationRegistry,
    abi: reputationRegistryAbi,
    functionName: "getTier",
    args: [agentId],
  } as const;
}

export function creditRead(deployment: Deployment, agentId: Hex) {
  return {
    address: deployment.addresses.creditLine,
    abi: creditLineAbi,
    functionName: "credits",
    args: [agentId],
  } as const;
}

export function remainingCreditRead(deployment: Deployment, agentId: Hex) {
  return {
    address: deployment.addresses.creditLine,
    abi: creditLineAbi,
    functionName: "getRemainingCredit",
    args: [agentId],
  } as const;
}

export function policyRead(deployment: Deployment, agentId: Hex) {
  return {
    address: deployment.addresses.policyVault,
    abi: policyVaultAbi,
    functionName: "policies",
    args: [agentId],
  } as const;
}

export function remainingDailySpendRead(deployment: Deployment, agentId: Hex) {
  return {
    address: deployment.addresses.policyVault,
    abi: policyVaultAbi,
    functionName: "getRemainingDailySpend",
    args: [agentId],
  } as const;
}

/** owner() on every protocol contract — the only real permission on-chain. */
export function ownerReads(deployment: Deployment) {
  return CONTRACT_NAMES.map(
    (name) =>
      ({
        address: deployment.addresses[name],
        abi: ownableAbi,
        functionName: "owner",
      }) as const,
  );
}

/* --- decoded shapes --- */

export type AgentRecord = {
  agentId: Hex;
  operator: Address;
  bondAmount: bigint;
  createdAt: bigint;
  active: boolean;
};

export type ReputationRecord = {
  score: bigint;
  totalActions: bigint;
  positiveActions: bigint;
  negativeActions: bigint;
  commitmentRoot: Hex;
  lastUpdate: bigint;
};

/** CreditLine.Status — mirrors the enum declared in CreditLine.sol. */
export const CREDIT_STATUS = ["None", "Active", "Expired", "Liquidated"] as const;
export type CreditStatus = (typeof CREDIT_STATUS)[number];

export function creditStatusOf(raw: number): CreditStatus {
  return CREDIT_STATUS[raw] ?? "None";
}

export type CreditRecord = {
  totalCredit: bigint;
  drawdown: bigint;
  remaining: bigint;
  status: CreditStatus;
  expiry: bigint;
  lastProofTime: bigint;
};

export type PolicyRecord = {
  dailyLimit: bigint;
  dailyUsed: bigint;
  remainingDaily: bigint;
};

/** ReputationRegistry.getTier: 0 none, 1 basic, 2 established, 3 trusted. */
export const TIER_NAMES = ["No tier", "Basic", "Established", "Trusted"] as const;

export function tierName(tier: number): string {
  return TIER_NAMES[tier] ?? "No tier";
}
