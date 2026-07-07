import { buildPoseidon } from "circomlibjs";

let _poseidon = null;
let _F = null;

/**
 * Get Poseidon hasher instance (singleton)
 */
export async function getPoseidon() {
  if (!_poseidon) {
    _poseidon = await buildPoseidon();
    _F = _poseidon.F;
  }
  return { poseidon: _poseidon, F: _F };
}

/**
 * Compute Poseidon hash of an array of inputs
 */
export async function poseidonHash(inputs) {
  const { poseidon, F } = await getPoseidon();
  return F.toObject(poseidon(inputs));
}

/**
 * Build a Poseidon hash chain from a secret and action results.
 *
 * state_0 = Poseidon(secret, 0)
 * state_i = Poseidon(state_{i-1}, result_i)
 * finalState = state_N
 *
 * @param {bigint} secret - Agent's private secret
 * @param {number[]} results - Array of 0/1 values (failure/success)
 * @returns {bigint} Final state (commitment root)
 */
export async function buildHashChain(secret, results) {
  let state = await poseidonHash([secret, 0n]);

  for (const result of results) {
    state = await poseidonHash([state, BigInt(result)]);
  }

  return state;
}

/**
 * Generate a random secret for commitment
 */
export function generateSecret() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return BigInt("0x" + Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("")) % (21888242871839275222246405745257275088548364400416034343698204186575808495617n);
}

/**
 * Parse an action log file and extract results.
 *
 * Expected format:
 * [
 *   { "actionId": "0x...", "result": 1, "timestamp": 1234567890 },
 *   ...
 * ]
 *
 * @param {string} logPath - Path to the action log JSON file
 * @returns {{ actionIds: bigint[], results: number[] }}
 */
export function parseActionLog(log) {
  const actionIds = [];
  const results = [];

  for (const entry of log) {
    actionIds.push(BigInt(entry.actionId));
    results.push(entry.result);
  }

  return { actionIds, results };
}
