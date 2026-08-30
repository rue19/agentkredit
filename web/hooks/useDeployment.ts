"use client";

import { deploymentFor, deployments, type Deployment } from "@/config/contracts";
import { useActiveChain } from "@/hooks/useActiveChain";

export type DeploymentState = {
  deployment: Deployment | null;
  /** Why there is no deployment, phrased for the UI. Null when there is one. */
  reason: string | null;
};

/*
  Resolves the contract set for the chain currently being read. Absent a
  deployment the app has nothing to ask, and says so in the same words
  everywhere.
*/
export function useDeployment(): DeploymentState {
  const { readChainId, readChainName } = useActiveChain();
  const deployment = deploymentFor(readChainId);

  if (deployment) return { deployment, reason: null };

  return {
    deployment: null,
    reason:
      deployments.configError ??
      `AgentKredit is not deployed on ${readChainName} yet.`,
  };
}
