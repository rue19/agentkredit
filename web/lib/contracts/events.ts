import { getAbiItem, type Address, type Hex, type PublicClient } from "viem";
import { agentRegistryAbi, creditLineAbi, reputationRegistryAbi } from "@/lib/abis";
import type { Deployment } from "@/config/contracts";
import { formatBot } from "@/lib/format";

/*
  Event layer.

  Everything the app knows about history comes from eth_getLogs against the
  deployed contracts. There is no indexer and no API: if the chain cannot
  answer, the UI says so rather than filling in.
*/

const AgentRegistered = getAbiItem({ abi: agentRegistryAbi, name: "AgentRegistered" });
const AgentDeactivated = getAbiItem({ abi: agentRegistryAbi, name: "AgentDeactivated" });
const BondWithdrawn = getAbiItem({ abi: agentRegistryAbi, name: "BondWithdrawn" });
const AttestationRecorded = getAbiItem({ abi: reputationRegistryAbi, name: "AttestationRecorded" });
const CreditLineGranted = getAbiItem({ abi: creditLineAbi, name: "CreditLineGranted" });
const CreditDrawnDown = getAbiItem({ abi: creditLineAbi, name: "CreditDrawnDown" });
const CreditRepaid = getAbiItem({ abi: creditLineAbi, name: "CreditRepaid" });
const CreditExpired = getAbiItem({ abi: creditLineAbi, name: "CreditExpired" });
const CreditRevoked = getAbiItem({ abi: creditLineAbi, name: "CreditRevoked" });

/**
 * Every agentId this operator has registered.
 *
 * AgentRegistry stores agents by agentId and keeps no operator index, so the
 * registration event — where operator is indexed — is the only on-chain way
 * to get from a wallet to its agents.
 */
export async function fetchAgentIdsForOperator(
  client: PublicClient,
  deployment: Deployment,
  operator: Address,
): Promise<Hex[]> {
  const logs = await client.getLogs({
    address: deployment.addresses.agentRegistry,
    event: AgentRegistered,
    args: { operator },
    fromBlock: deployment.startBlock,
    toBlock: "latest",
  });

  const seen = new Set<Hex>();
  for (const log of logs) {
    const agentId = log.args.agentId;
    if (agentId) seen.add(agentId);
  }
  return [...seen];
}

export type ActivityItem = {
  id: string;
  /** Human label, e.g. "Credit drawn down". */
  title: string;
  /** Optional second line, already formatted. */
  detail: string | null;
  agentId: Hex | null;
  blockNumber: bigint;
  logIndex: number;
  transactionHash: Hex;
  timestamp: bigint | null;
};

/**
 * Recent protocol activity for one operator and its agents.
 *
 * Registry events are filtered by operator; reputation and credit events are
 * filtered by the agentIds that operator owns. Nothing else is included,
 * because nothing else can be attributed to this wallet from logs alone.
 */
export async function fetchRecentActivity(
  client: PublicClient,
  deployment: Deployment,
  operator: Address,
  agentIds: Hex[],
  limit = 6,
): Promise<ActivityItem[]> {
  const fromBlock = deployment.startBlock;
  const items: ActivityItem[] = [];

  const registryLogs = await client.getLogs({
    address: deployment.addresses.agentRegistry,
    events: [AgentRegistered, AgentDeactivated, BondWithdrawn],
    fromBlock,
    toBlock: "latest",
  });

  for (const log of registryLogs) {
    const agentId = (log.args as { agentId?: Hex }).agentId ?? null;
    /* AgentDeactivated and BondWithdrawn do not carry the operator, so they
       are kept only when they belong to an agent this wallet registered. */
    if (log.eventName === "AgentRegistered") {
      if ((log.args as { operator?: Address }).operator?.toLowerCase() !== operator.toLowerCase()) {
        continue;
      }
    } else if (!agentId || !agentIds.includes(agentId)) {
      continue;
    }

    items.push(
      base(log, agentId, registryTitle(log.eventName), registryDetail(log)),
    );
  }

  if (agentIds.length > 0) {
    const [attestationLogs, creditLogs] = await Promise.all([
      client.getLogs({
        address: deployment.addresses.reputationRegistry,
        event: AttestationRecorded,
        args: { agentId: agentIds },
        fromBlock,
        toBlock: "latest",
      }),
      /* viem only accepts indexed `args` alongside a single `event`, so the
         five credit events are fetched together and narrowed here. */
      client.getLogs({
        address: deployment.addresses.creditLine,
        events: [CreditLineGranted, CreditDrawnDown, CreditRepaid, CreditExpired, CreditRevoked],
        fromBlock,
        toBlock: "latest",
      }),
    ]);

    for (const log of attestationLogs) {
      const delta = log.args.scoreDelta;
      items.push(
        base(
          log,
          log.args.agentId ?? null,
          "Attestation recorded",
          delta === undefined ? null : `Score ${delta >= 0n ? "+" : ""}${delta.toString()}`,
        ),
      );
    }

    for (const log of creditLogs) {
      const agentId = (log.args as { agentId?: Hex }).agentId ?? null;
      if (!agentId || !agentIds.includes(agentId)) continue;

      items.push(
        base(
          log,
          agentId,
          creditTitle(log.eventName),
          creditDetail(log),
        ),
      );
    }
  }

  items.sort(
    (a, b) =>
      Number(b.blockNumber - a.blockNumber) || b.logIndex - a.logIndex,
  );

  const recent = items.slice(0, limit);
  return withTimestamps(client, recent);
}

/* Block times are a nicety: if the node will not serve them the rows still
   render, keyed by block number instead. */
async function withTimestamps(
  client: PublicClient,
  items: ActivityItem[],
): Promise<ActivityItem[]> {
  const blocks = [...new Set(items.map((item) => item.blockNumber))];
  const times = new Map<bigint, bigint>();

  await Promise.all(
    blocks.map(async (blockNumber) => {
      try {
        const block = await client.getBlock({ blockNumber });
        times.set(blockNumber, block.timestamp);
      } catch {
        /* leave it unset */
      }
    }),
  );

  return items.map((item) => ({
    ...item,
    timestamp: times.get(item.blockNumber) ?? null,
  }));
}

type RawLog = {
  blockNumber: bigint | null;
  logIndex: number | null;
  transactionHash: Hex | null;
};

function base(log: RawLog, agentId: Hex | null, title: string, detail: string | null): ActivityItem {
  const blockNumber = log.blockNumber ?? 0n;
  const logIndex = log.logIndex ?? 0;
  const transactionHash = log.transactionHash ?? ("0x" as Hex);
  return {
    id: `${transactionHash}:${logIndex}`,
    title,
    detail,
    agentId,
    blockNumber,
    logIndex,
    transactionHash,
    timestamp: null,
  };
}

function registryTitle(eventName: string): string {
  if (eventName === "AgentRegistered") return "Agent registered";
  if (eventName === "AgentDeactivated") return "Agent deactivated";
  return "Bond withdrawn";
}

function registryDetail(log: { eventName: string; args: unknown }): string | null {
  const args = log.args as { bondAmount?: bigint; amount?: bigint };
  if (log.eventName === "AgentRegistered" && args.bondAmount !== undefined) {
    return `Bond ${formatBot(args.bondAmount)} BOT`;
  }
  if (log.eventName === "BondWithdrawn" && args.amount !== undefined) {
    return `${formatBot(args.amount)} BOT returned`;
  }
  return null;
}

function creditTitle(eventName: string): string {
  switch (eventName) {
    case "CreditLineGranted":
      return "Credit line granted";
    case "CreditDrawnDown":
      return "Credit drawn down";
    case "CreditRepaid":
      return "Credit repaid";
    case "CreditExpired":
      return "Credit line expired";
    default:
      return "Credit line revoked";
  }
}

function creditDetail(log: { eventName: string; args: unknown }): string | null {
  const args = log.args as { amount?: bigint; reason?: string };
  if (log.eventName === "CreditRevoked") return args.reason ?? null;
  if (args.amount !== undefined) return `${formatBot(args.amount)} BOT`;
  return null;
}
