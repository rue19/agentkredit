/*
  Hand-transcribed from contracts/AgentRegistry.sol, cross-checked against
  the compiled artifact in services/attestation-oracle/abis/AgentRegistry.json.

  Only the members the frontend actually calls are listed. Nothing here is
  invented: every entry exists on the deployed contract.
*/
export const agentRegistryAbi = [
  {
    type: "function",
    name: "getAgent",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "bytes32" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "operator", type: "address" },
          { name: "bondAmount", type: "uint256" },
          { name: "createdAt", type: "uint64" },
          { name: "active", type: "bool" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "isAgentActive",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "bytes32" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "minBondAmount",
    stateMutability: "view",
    inputs: [],
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
    name: "AgentRegistered",
    inputs: [
      { name: "agentId", type: "bytes32", indexed: true },
      { name: "operator", type: "address", indexed: true },
      { name: "bondAmount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "AgentDeactivated",
    inputs: [{ name: "agentId", type: "bytes32", indexed: true }],
  },
  {
    type: "event",
    name: "BondWithdrawn",
    inputs: [
      { name: "agentId", type: "bytes32", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
] as const;
