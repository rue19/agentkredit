import { ethers } from "ethers";
import { getProvider } from "./attester.js";
import { AGENT_REGISTRY_ADDRESS, POLL_INTERVAL_MS } from "./config.js";
import agentRegistryAbi from "./abis/AgentRegistry.json" with { type: "json" };

/**
 * Watches for agent activity events on-chain.
 * Emits structured attestation requests for the submitter to process.
 */
export class EventWatcher {
  constructor() {
    this.provider = getProvider();
    this.agentRegistry = new ethers.Contract(AGENT_REGISTRY_ADDRESS, agentRegistryAbi, this.provider);
    this.lastBlock = null;
    this.listeners = [];
  }

  /**
   * Register a callback to be called when an attestation-worthy event is detected.
   * Callback receives: { agentId, eventType, actionHash, timestamp }
   */
  onEvent(callback) {
    this.listeners.push(callback);
  }

  _emit(data) {
    for (const cb of this.listeners) {
      cb(data);
    }
  }

  /**
   * Start watching for events. Polls every POLL_INTERVAL_MS.
   */
  async start() {
    const currentBlock = await this.provider.getBlockNumber();
    this.lastBlock = currentBlock;
    console.log(`[Watcher] Starting from block ${currentBlock}`);

    this._interval = setInterval(() => this._poll(), POLL_INTERVAL_MS);
  }

  stop() {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
    console.log("[Watcher] Stopped");
  }

  async _poll() {
    try {
      const currentBlock = await this.provider.getBlockNumber();
      if (currentBlock <= this.lastBlock) return;

      // Look for AgentRegistered events
      const agentEvents = await this.agentRegistry.queryFilter(
        "AgentRegistered",
        this.lastBlock + 1,
        currentBlock
      );

      for (const event of agentEvents) {
        const agentId = event.args[0];
        const operator = event.args[1];
        const bondAmount = event.args[2];

        console.log(`[Watcher] Agent registered: ${agentId} by ${operator}`);

        this._emit({
          agentId,
          operator,
          eventType: "AGENT_REGISTERED",
          bondAmount: bondAmount.toString(),
          blockNumber: event.blockNumber,
          transactionHash: event.transactionHash,
        });
      }

      // Look for AgentDeactivated events
      const deactivationEvents = await this.agentRegistry.queryFilter(
        "AgentDeactivated",
        this.lastBlock + 1,
        currentBlock
      );

      for (const event of deactivationEvents) {
        const agentId = event.args[0];
        console.log(`[Watcher] Agent deactivated: ${agentId}`);

        this._emit({
          agentId,
          eventType: "AGENT_DEACTIVATED",
          blockNumber: event.blockNumber,
          transactionHash: event.transactionHash,
        });
      }

      this.lastBlock = currentBlock;
    } catch (error) {
      console.error("[Watcher] Poll error:", error.message);
    }
  }
}

/**
 * Manually submit an attestation request (for testing or off-chain activity).
 * This creates a structured request that the submitter can process.
 */
export function createAttestationRequest(agentId, eventType, metadata = {}) {
  const timestamp = Math.floor(Date.now() / 1000);
  return {
    agentId,
    eventType,
    timestamp,
    metadata,
  };
}
