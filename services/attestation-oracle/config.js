import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, ".env") });

export const RPC_URL = process.env.RPC_URL || "https://rpc.botchaintestnet.ai";
export const ATTESTER_PRIVATE_KEY = process.env.ATTESTER_PRIVATE_KEY;
export const AGENT_REGISTRY_ADDRESS = process.env.AGENT_REGISTRY_ADDRESS;
export const REPUTATION_REGISTRY_ADDRESS = process.env.REPUTANCE_REGISTRY_ADDRESS;
export const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || "5000");
export const MIN_POSITIVE_DELTA = parseInt(process.env.MIN_POSITIVE_DELTA || "5");
export const MAX_POSITIVE_DELTA = parseInt(process.env.MAX_POSITIVE_DELTA || "20");
export const NEGATIVE_DELTA = parseInt(process.env.NEGATIVE_DELTA || "-10");

// EIP-712 domain (must match ReputationRegistry.sol constructor)
export const EIP712_DOMAIN = {
  name: "AgentKredit",
  version: "1",
};

// EIP-712 type (must match ATTESTATION_TYPEHASH in ReputationRegistry.sol)
export const ATTESTATION_TYPE = {
  Attestation: [
    { name: "agentId", type: "bytes32" },
    { name: "scoreDelta", type: "int256" },
    { name: "newCommitmentRoot", type: "bytes32" },
    { name: "actionHash", type: "bytes32" },
  ],
};
