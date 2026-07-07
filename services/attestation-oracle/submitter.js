import { ethers } from "ethers";
import { getProvider, getWallet, signAttestation, computeActionHash, computeCommitmentRoot } from "./attester.js";
import {
  REPUTATION_REGISTRY_ADDRESS,
  MIN_POSITIVE_DELTA,
  MAX_POSITIVE_DELTA,
  NEGATIVE_DELTA,
} from "./config.js";
import reputationRegistryAbi from "./abis/ReputationRegistry.json" with { type: "json" };

/**
 * Submits signed attestations to the ReputationRegistry on-chain.
 */
export class AttestationSubmitter {
  constructor() {
    this.provider = getProvider();
    this.wallet = getWallet();
    this.registry = new ethers.Contract(REPUTATION_REGISTRY_ADDRESS, reputationRegistryAbi, this.wallet);
    this.actionLog = new Map(); // agentId -> actionHash[] (for building commitment roots)
  }

  /**
   * Process an attestation request: compute deltas, sign, and submit.
   */
  async submitAttestation(request) {
    const { agentId, eventType, timestamp, metadata } = request;

    console.log(`[Submitter] Processing ${eventType} for agent ${agentId}`);

    // Determine score delta based on event type
    const scoreDelta = this._computeScoreDelta(eventType, metadata);

    // Compute action hash
    const actionHash = computeActionHash(
      agentId,
      eventType,
      timestamp,
      metadata.payload || "0x"
    );

    // Update action log and compute new commitment root
    if (!this.actionLog.has(agentId)) {
      this.actionLog.set(agentId, []);
    }
    this.actionLog.get(agentId).push(actionHash);
    const newCommitmentRoot = computeCommitmentRoot(this.actionLog.get(agentId));

    // Sign the attestation
    console.log(`[Submitter] Signing attestation: delta=${scoreDelta}, root=${newCommitmentRoot}`);
    const signature = await signAttestation(agentId, scoreDelta, newCommitmentRoot, actionHash);

    // Submit on-chain
    console.log(`[Submitter] Submitting to ReputationRegistry...`);
    const tx = await this.registry.recordAttestation(
      agentId,
      scoreDelta,
      newCommitmentRoot,
      actionHash,
      signature
    );

    console.log(`[Submitter] Tx sent: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`[Submitter] Confirmed in block ${receipt.blockNumber}, gas used: ${receipt.gasUsed.toString()}`);

    return {
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      agentId,
      scoreDelta,
      newCommitmentRoot,
      actionHash,
      gasUsed: receipt.gasUsed.toString(),
    };
  }

  /**
   * Submit multiple attestations in sequence.
   */
  async submitBatch(requests) {
    const results = [];
    for (const request of requests) {
      try {
        const result = await this.submitAttestation(request);
        results.push({ success: true, ...result });
      } catch (error) {
        console.error(`[Submitter] Failed for ${request.agentId}:`, error.message);
        results.push({
          success: false,
          agentId: request.agentId,
          error: error.message,
        });
      }
    }
    return results;
  }

  /**
   * Compute score delta based on event type and metadata.
   */
  _computeScoreDelta(eventType, metadata) {
    switch (eventType) {
      case "AGENT_REGISTERED":
        // New agent gets a small initial score boost
        return MIN_POSITIVE_DELTA;

      case "TASK_COMPLETED":
      case "TRADE_SUCCESSFUL":
        // Positive outcome — scale by performance if provided
        if (metadata.performance) {
          return Math.min(
            MAX_POSITIVE_DELTA,
            Math.max(MIN_POSITIVE_DELTA, Math.floor(metadata.performance * MAX_POSITIVE_DELTA))
          );
        }
        return MIN_POSITIVE_DELTA;

      case "TASK_FAILED":
      case "TRADE_FAILED":
      case "POLICY_VIOLATION":
        return NEGATIVE_DELTA;

      case "AGENT_DEACTIVATED":
        // No score change on deactivation — handled by decay
        return 0;

      default:
        console.log(`[Submitter] Unknown event type: ${eventType}, using default delta`);
        return MIN_POSITIVE_DELTA;
    }
  }
}
