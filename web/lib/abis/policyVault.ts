/*
  Transcribed from contracts/PolicyVault.sol.

  The `policies` getter omits the struct's two array members — Solidity does
  not return arrays from auto-generated struct getters — so allowedTargets
  and allowedSelectors are simply not readable this way, and the UI does not
  claim to know them.
*/
export const policyVaultAbi = [
  {
    type: "function",
    name: "policies",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "bytes32" }],
    outputs: [
      { name: "dailyLimit", type: "uint256" },
      { name: "dailyUsed", type: "uint256" },
      { name: "lastResetDay", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "getRemainingDailySpend",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "bytes32" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "event",
    name: "SpendExecuted",
    inputs: [
      { name: "agentId", type: "bytes32", indexed: true },
      { name: "sessionId", type: "bytes32", indexed: true },
      { name: "target", type: "address", indexed: false },
      { name: "selector", type: "bytes4", indexed: false },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
] as const;
