import { isAddress, type Address } from "viem";
import { supportedChains } from "@/lib/chains";

/*
  Where the protocol actually lives.

  Nothing is hardcoded here, because nothing is deployed yet:
  scripts/deploy-testnet.js writes deployed-addresses.json, and that file is
  gitignored and absent. The app therefore takes its addresses from a single
  public env var holding the same JSON shape the deploy script emits, so
  wiring a deployment up is one copy/paste and no code change.

  Until that var is set every contract-backed surface reports itself as
  unavailable rather than inventing a value.

  NEXT_PUBLIC_DEPLOYMENTS — a JSON array (or single object) of:
    { "chainId": 968,
      "startBlock": 1234567,
      "contracts": {
        "agentRegistry": "0x…", "reputationRegistry": "0x…",
        "creditLine": "0x…", "liquidityPool": "0x…",
        "policyVault": "0x…", "sessionKeyManager": "0x…" } }
*/

export const CONTRACT_NAMES = [
  "agentRegistry",
  "reputationRegistry",
  "creditLine",
  "liquidityPool",
  "policyVault",
  "sessionKeyManager",
] as const;

export type ContractName = (typeof CONTRACT_NAMES)[number];

export type Deployment = {
  chainId: number;
  /* First block worth scanning for events. 0 when the deployer did not say. */
  startBlock: bigint;
  addresses: Record<ContractName, Address>;
};

export type DeploymentRegistry = {
  byChainId: Map<number, Deployment>;
  /* Set when NEXT_PUBLIC_DEPLOYMENTS is present but unusable. */
  configError: string | null;
};

function parse(raw: string | undefined): DeploymentRegistry {
  const byChainId = new Map<number, Deployment>();
  if (!raw || raw.trim() === "") return { byChainId, configError: null };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { byChainId, configError: "NEXT_PUBLIC_DEPLOYMENTS is not valid JSON." };
  }

  const entries = Array.isArray(parsed) ? parsed : [parsed];

  for (const entry of entries) {
    if (typeof entry !== "object" || entry === null) {
      return { byChainId, configError: "NEXT_PUBLIC_DEPLOYMENTS entries must be objects." };
    }
    const { chainId, startBlock, contracts } = entry as Record<string, unknown>;

    if (typeof chainId !== "number" || !supportedChains.some((c) => c.id === chainId)) {
      return {
        byChainId,
        configError: `NEXT_PUBLIC_DEPLOYMENTS names chain ${String(chainId)}, which the app is not configured for.`,
      };
    }
    if (typeof contracts !== "object" || contracts === null) {
      return { byChainId, configError: `Deployment for chain ${chainId} has no contracts map.` };
    }

    const addresses = {} as Record<ContractName, Address>;
    for (const name of CONTRACT_NAMES) {
      const value = (contracts as Record<string, unknown>)[name];
      if (typeof value !== "string" || !isAddress(value)) {
        return {
          byChainId,
          configError: `Deployment for chain ${chainId} is missing a valid ${name} address.`,
        };
      }
      addresses[name] = value;
    }

    byChainId.set(chainId, {
      chainId,
      startBlock: toBlock(startBlock),
      addresses,
    });
  }

  return { byChainId, configError: null };
}

function toBlock(value: unknown): bigint {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) return BigInt(value);
  if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
  return 0n;
}

/* Referenced statically so Next.js can inline it at build time. */
export const deployments = parse(process.env.NEXT_PUBLIC_DEPLOYMENTS);

export function deploymentFor(chainId: number | undefined): Deployment | null {
  if (chainId === undefined) return null;
  return deployments.byChainId.get(chainId) ?? null;
}
