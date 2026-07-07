import * as snarkjs from "snarkjs";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { buildHashChain, generateSecret, parseActionLog } from "./action-log.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Circuit configurations
 */
const CIRCUITS = {
  successRate: {
    wasmPath: path.join(__dirname, "../../build/success-rate/success-rate_js/success-rate.wasm"),
    zkeyPath: path.join(__dirname, "../../build/success-rate/success-rate_final.zkey"),
    vkPath: path.join(__dirname, "../../build/success-rate/success-rate_vk.json"),
  },
  zeroViolations: {
    wasmPath: path.join(__dirname, "../../build/zero-violations/zero-violations_js/zero-violations.wasm"),
    zkeyPath: path.join(__dirname, "../../build/zero-violations/zero-violations_final.zkey"),
    vkPath: path.join(__dirname, "../../build/zero-violations/zero-violations_vk.json"),
  },
  actionCount: {
    wasmPath: path.join(__dirname, "../../build/action-count/action-count_js/action-count.wasm"),
    zkeyPath: path.join(__dirname, "../../build/action-count/action-count_final.zkey"),
    vkPath: path.join(__dirname, "../../build/action-count/action-count_vk.json"),
  },
};

/**
 * Generate a ZK proof for a success rate claim.
 *
 * @param {Object} options
 * @param {number[]} options.results - Array of 0/1 values
 * @param {bigint} options.secret - Agent's private secret
 * @param {number} options.minSuccessCount - Threshold to prove
 * @returns {{ proof, publicSignals, formattedProof }}
 */
export async function proveSuccessRate({ results, secret, minSuccessCount }) {
  const config = CIRCUITS.successRate;

  // Build hash chain to get commitment root
  const commitmentRoot = await buildHashChain(secret, results);

  // Circuit inputs
  const input = {
    commitmentRoot: commitmentRoot.toString(),
    minSuccessCount: minSuccessCount.toString(),
    secret: secret.toString(),
    results: results.map(r => r.toString()),
  };

  // Generate proof
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    input,
    config.wasmPath,
    config.zkeyPath
  );

  // Format for on-chain submission
  const formattedProof = formatProof(proof);

  // Verify locally before returning
  const vKey = JSON.parse(fs.readFileSync(config.vkPath, "utf8"));
  const valid = await snarkjs.groth16.verify(vKey, publicSignals, proof);
  if (!valid) throw new Error("Local verification failed!");

  return {
    proof,
    publicSignals,
    formattedProof,
    commitmentRoot: commitmentRoot.toString(),
  };
}

/**
 * Generate a ZK proof for a zero violations claim.
 */
export async function proveZeroViolations({ violationFlags, secret, actionCount }) {
  const config = CIRCUITS.zeroViolations;

  const commitmentRoot = await buildHashChain(secret, violationFlags);

  const input = {
    commitmentRoot: commitmentRoot.toString(),
    actionCount: actionCount.toString(),
    secret: secret.toString(),
    violationFlags: violationFlags.map(f => f.toString()),
  };

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    input,
    config.wasmPath,
    config.zkeyPath
  );

  const formattedProof = formatProof(proof);

  const vKey = JSON.parse(fs.readFileSync(config.vkPath, "utf8"));
  const valid = await snarkjs.groth16.verify(vKey, publicSignals, proof);
  if (!valid) throw new Error("Local verification failed!");

  return {
    proof,
    publicSignals,
    formattedProof,
    commitmentRoot: commitmentRoot.toString(),
  };
}

/**
 * Generate a ZK proof for an action count claim.
 */
export async function proveActionCount({ actionCount, secret, minActionCount }) {
  const config = CIRCUITS.actionCount;

  // Build chain with actionCount 1s (each action performed)
  const results = new Array(actionCount).fill(1);
  // Pad to 100 with 0s
  while (results.length < 100) results.push(0);

  const commitmentRoot = await buildHashChain(secret, results);

  const input = {
    commitmentRoot: commitmentRoot.toString(),
    minActionCount: minActionCount.toString(),
    secret: secret.toString(),
    actionCount: actionCount.toString(),
  };

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    input,
    config.wasmPath,
    config.zkeyPath
  );

  const formattedProof = formatProof(proof);

  const vKey = JSON.parse(fs.readFileSync(config.vkPath, "utf8"));
  const valid = await snarkjs.groth16.verify(vKey, publicSignals, proof);
  if (!valid) throw new Error("Local verification failed!");

  return {
    proof,
    publicSignals,
    formattedProof,
    commitmentRoot: commitmentRoot.toString(),
  };
}

/**
 * Format snarkjs proof for Solidity verifier submission.
 * Handles the G2 point coordinate reversal.
 *
 * @param {Object} proof - snarkjs proof object
 * @returns {{ pA: string[], pB: string[][], pC: string[] }}
 */
function formatProof(proof) {
  return {
    pA: [proof.pi_a[0], proof.pi_a[1]],
    pB: [
      [proof.pi_b[0][1], proof.pi_b[0][0]], // Reversed!
      [proof.pi_b[1][1], proof.pi_b[1][0]], // Reversed!
    ],
    pC: [proof.pi_c[0], proof.pi_c[1]],
  };
}
