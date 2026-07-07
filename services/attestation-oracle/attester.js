import { ethers } from "ethers";
import { ATTESTER_PRIVATE_KEY, EIP712_DOMAIN, ATTESTATION_TYPE, REPUTATION_REGISTRY_ADDRESS, RPC_URL } from "./config.js";

let _wallet = null;
let _provider = null;

export function getProvider() {
  if (!_provider) {
    _provider = new ethers.JsonRpcProvider(RPC_URL);
  }
  return _provider;
}

export function getWallet() {
  if (!_wallet) {
    if (!ATTESTER_PRIVATE_KEY) {
      throw new Error("ATTESTER_PRIVATE_KEY not set in .env");
    }
    _wallet = new ethers.Wallet(ATTESTER_PRIVATE_KEY, getProvider());
  }
  return _wallet;
}

export function getAttesterAddress() {
  return getWallet().address;
}

/**
 * Sign an attestation using EIP-712 typed data.
 * This produces the signature that gets submitted on-chain.
 */
export async function signAttestation(agentId, scoreDelta, newCommitmentRoot, actionHash) {
  const wallet = getWallet();
  const chainId = (await getProvider().getNetwork()).chainId;

  const domain = {
    ...EIP712_DOMAIN,
    chainId,
    verifyingContract: REPUTATION_REGISTRY_ADDRESS,
  };

  const value = {
    agentId,
    scoreDelta,
    newCommitmentRoot,
    actionHash,
  };

  const signature = await wallet.signTypedData(domain, ATTESTATION_TYPE, value);
  return signature;
}

/**
 * Compute a deterministic action hash from agent activity data.
 */
export function computeActionHash(agentId, actionType, timestamp, payload) {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes32", "string", "uint256", "bytes"],
      [agentId, actionType, timestamp, payload || "0x"]
    )
  );
}

/**
 * Compute a mock commitment root for demo purposes.
 * In production, this would be a Poseidon Merkle root of the agent's private action log.
 */
export function computeCommitmentRoot(actions) {
  if (!actions || actions.length === 0) {
    return ethers.ZeroHash;
  }
  // Simple hash chain for demo — replace with Poseidon Merkle tree in production
  let root = ethers.ZeroHash;
  for (const action of actions) {
    root = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["bytes32", "bytes32"],
        [root, action]
      )
    );
  }
  return root;
}
