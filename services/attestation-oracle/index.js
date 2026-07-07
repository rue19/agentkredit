import { EventWatcher } from "./watcher.js";
import { AttestationSubmitter } from "./submitter.js";
import { getAttesterAddress, getProvider } from "./attester.js";
import {
  AGENT_REGISTRY_ADDRESS,
  REPUTATION_REGISTRY_ADDRESS,
  RPC_URL,
} from "./config.js";

async function main() {
  console.log("=== AgentKredit Attestation Oracle ===");
  console.log(`RPC: ${RPC_URL}`);
  console.log(`AgentRegistry: ${AGENT_REGISTRY_ADDRESS}`);
  console.log(`ReputationRegistry: ${REPUTATION_REGISTRY_ADDRESS}`);

  // Verify attester wallet
  const attesterAddress = getAttesterAddress();
  console.log(`Attester address: ${attesterAddress}`);

  // Check attester balance
  const balance = await getProvider().getBalance(attesterAddress);
  console.log(`Attester balance: ${balance.toString()} wei`);

  if (balance === 0n) {
    console.warn("WARNING: Attester has zero balance. Fund it to submit transactions.");
  }

  // Initialize components
  const submitter = new AttestationSubmitter();
  const watcher = new EventWatcher();

  // Wire: when watcher detects an event, submitter processes it
  watcher.onEvent(async (event) => {
    try {
      const result = await submitter.submitAttestation({
        agentId: event.agentId,
        eventType: event.eventType,
        timestamp: Math.floor(Date.now() / 1000),
        metadata: {
          operator: event.operator,
          bondAmount: event.bondAmount,
          blockNumber: event.blockNumber,
          transactionHash: event.transactionHash,
        },
      });
      console.log(`[Oracle] Attestation submitted: ${result.txHash}`);
    } catch (error) {
      console.error(`[Oracle] Failed to submit attestation:`, error.message);
    }
  });

  // Start watching
  await watcher.start();

  console.log("[Oracle] Running. Press Ctrl+C to stop.");

  // Graceful shutdown
  process.on("SIGINT", () => {
    console.log("\n[Oracle] Shutting down...");
    watcher.stop();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    watcher.stop();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error("[Oracle] Fatal error:", error);
  process.exit(1);
});
