#!/usr/bin/env node

/**
 * AgentKredit ZK Prover CLI
 *
 * Usage:
 *   node index.js --claim-type successRate --log ./action-log.json --threshold 70
 *   node index.js --claim-type zeroViolations --log ./action-log.json
 *   node index.js --claim-type actionCount --count 50 --min 25
 *
 * Action log format (JSON):
 * [
 *   { "actionId": "0x...", "result": 1 },
 *   { "actionId": "0x...", "result": 0 },
 *   ...
 * ]
 */

import fs from "fs";
import { proveSuccessRate, proveZeroViolations, proveActionCount } from "./prover.js";
import { generateSecret, parseActionLog } from "./action-log.js";

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

  if (args.help) {
    printUsage();
    return;
  }

  const claimType = args["claim-type"];
  if (!claimType) {
    console.error("Error: --claim-type is required");
    printUsage();
    process.exit(1);
  }

  // Load or generate secret
  const secret = args.secret
    ? BigInt(args.secret)
    : generateSecret();

  console.log(`Claim type: ${claimType}`);
  console.log(`Secret: ${secret.toString()}`);

  let result;

  switch (claimType) {
    case "successRate": {
      const logPath = args.log;
      if (!logPath) {
        console.error("Error: --log is required for successRate claim");
        process.exit(1);
      }
      const log = JSON.parse(fs.readFileSync(logPath, "utf8"));
      const { results } = parseActionLog(log);
      const threshold = parseInt(args.threshold || "70");
      const successCount = results.filter(r => r === 1).length;

      console.log(`Actions: ${results.length}`);
      console.log(`Successes: ${successCount} (${((successCount / results.length) * 100).toFixed(1)}%)`);
      console.log(`Threshold: ${threshold}% (${Math.ceil(results.length * threshold / 100)} successes needed)`);

      result = await proveSuccessRate({
        results,
        secret,
        minSuccessCount: Math.ceil(results.length * threshold / 100),
      });
      break;
    }

    case "zeroViolations": {
      const logPath = args.log;
      if (!logPath) {
        console.error("Error: --log is required for zeroViolations claim");
        process.exit(1);
      }
      const log = JSON.parse(fs.readFileSync(logPath, "utf8"));
      const { results } = parseActionLog(log);
      // For zero violations, results should be the violation flags
      const violationCount = results.filter(r => r === 1).length;

      console.log(`Actions: ${results.length}`);
      console.log(`Violations: ${violationCount}`);

      result = await proveZeroViolations({
        violationFlags: results,
        secret,
        actionCount: results.length,
      });
      break;
    }

    case "actionCount": {
      const count = parseInt(args.count || "10");
      const min = parseInt(args.min || "5");

      console.log(`Actions: ${count}`);
      console.log(`Minimum: ${min}`);

      result = await proveActionCount({
        actionCount: count,
        secret,
        minActionCount: min,
      });
      break;
    }

    default:
      console.error(`Unknown claim type: ${claimType}`);
      printUsage();
      process.exit(1);
  }

  // Output result
  console.log("\n=== Proof Generated ===");
  console.log(`Commitment root: ${result.commitmentRoot}`);
  console.log(`Public signals: ${JSON.stringify(result.publicSignals)}`);
  console.log(`Proof (for on-chain submission):`);
  console.log(JSON.stringify(result.formattedProof, null, 2));

  // Save to file if requested
  if (args.output) {
    const output = {
      claimType,
      commitmentRoot: result.commitmentRoot,
      publicSignals: result.publicSignals,
      proof: result.formattedProof,
    };
    fs.writeFileSync(args.output, JSON.stringify(output, null, 2));
    console.log(`\nSaved to: ${args.output}`);
  }
}

function printUsage() {
  console.log(`
AgentKredit ZK Prover

Usage:
  node index.js --claim-type <type> [options]

Claim types:
  successRate      Prove success rate >= threshold
  zeroViolations   Prove zero policy violations
  actionCount      Prove minimum action count

Options for successRate:
  --log <path>         Path to action log JSON file
  --threshold <pct>    Success rate threshold (default: 70)
  --secret <number>    Private secret (random if omitted)

Options for zeroViolations:
  --log <path>         Path to action log JSON file (result = violation flag)
  --secret <number>    Private secret

Options for actionCount:
  --count <n>          Number of actions performed
  --min <n>            Minimum actions to prove (default: 5)
  --secret <number>    Private secret

General:
  --output <path>      Save proof to JSON file
  --help               Show this help
  `);
}

main().catch((error) => {
  console.error("Error:", error.message);
  process.exit(1);
});
