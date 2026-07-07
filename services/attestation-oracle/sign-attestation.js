/**
 * CLI tool for manually signing and submitting attestations.
 *
 * Usage:
 *   node sign-attestation.js --agent-id <hex> --delta <int> --root <hex> --action <hex>
 *
 * Or in interactive mode:
 *   node sign-attestation.js --interactive
 */

import { signAttestation, computeActionHash, computeCommitmentRoot } from "./attester.js";
import { AttestationSubmitter } from "./submitter.js";
import { ethers } from "ethers";

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, "");
    parsed[key] = args[i + 1];
  }
  return parsed;
}

async function main() {
  const args = parseArgs();

  if (args.interactive) {
    await interactiveMode();
  } else if (args["agent-id"]) {
    await directMode(args);
  } else {
    printUsage();
  }
}

function printUsage() {
  console.log(`
AgentKredit Attestation Signer

Usage:
  node sign-attestation.js --agent-id <hex> --delta <int> --root <hex> --action <hex>
  node sign-attestation.js --interactive

Options:
  --agent-id     Agent ID (0x-prefixed bytes32)
  --delta        Score delta (integer, can be negative)
  --root         New commitment root (0x-prefixed bytes32)
  --action       Action hash (0x-prefixed bytes32)
  --interactive  Interactive mode (prompt for values)
  --submit       Also submit the attestation on-chain
  `);
}

async function directMode(args) {
  const agentId = args["agent-id"];
  const delta = parseInt(args.delta);
  const root = args.root;
  const actionHash = args.action || computeActionHash(agentId, "MANUAL", Math.floor(Date.now() / 1000));
  const submit = args.submit === "true";

  console.log("Signing attestation...");
  console.log(`  Agent: ${agentId}`);
  console.log(`  Delta: ${delta}`);
  console.log(`  Root: ${root}`);
  console.log(`  Action: ${actionHash}`);

  const signature = await signAttestation(agentId, delta, root, actionHash);
  console.log(`\nSignature: ${signature}`);

  if (submit) {
    console.log("\nSubmitting on-chain...");
    const submitter = new AttestationSubmitter();
    const result = await submitter.submitAttestation({
      agentId,
      eventType: "MANUAL",
      timestamp: Math.floor(Date.now() / 1000),
      metadata: { payload: actionHash },
    });
    console.log(`Tx: ${result.txHash}`);
  }
}

async function interactiveMode() {
  const readline = await import("readline");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const question = (q) => new Promise((resolve) => rl.question(q, resolve));

  console.log("=== AgentKredit Attestation Signer (Interactive) ===\n");

  const agentId = await question("Agent ID (0x...): ");
  const delta = parseInt(await question("Score delta (e.g. 10 or -5): "));
  const root = await question("Commitment root (0x... or 'auto'): ");

  let commitmentRoot = root;
  if (root === "auto") {
    commitmentRoot = computeCommitmentRoot([computeActionHash(agentId, "INTERACTIVE", Math.floor(Date.now() / 1000))]);
    console.log(`  Computed root: ${commitmentRoot}`);
  }

  const actionHash = computeActionHash(agentId, "INTERACTIVE", Math.floor(Date.now() / 1000));
  console.log(`  Action hash: ${actionHash}`);

  const signature = await signAttestation(agentId, delta, commitmentRoot, actionHash);
  console.log(`\nSignature: ${signature}`);

  const submit = await question("\nSubmit on-chain? (y/n): ");
  if (submit.toLowerCase() === "y") {
    const submitter = new AttestationSubmitter();
    const result = await submitter.submitAttestation({
      agentId,
      eventType: "INTERACTIVE",
      timestamp: Math.floor(Date.now() / 1000),
      metadata: { payload: actionHash },
    });
    console.log(`Tx: ${result.txHash}`);
  }

  rl.close();
}

main().catch((error) => {
  console.error("Error:", error.message);
  process.exit(1);
});
