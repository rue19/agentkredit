/*
  Transcribed from contracts/ReputationRegistry.sol, cross-checked against
  services/attestation-oracle/abis/ReputationRegistry.json.
*/
export const reputationRegistryAbi = [
  {
    type: "function",
    name: "getReputation",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "bytes32" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "score", type: "int256" },
          { name: "totalActions", type: "uint256" },
          { name: "positiveActions", type: "uint256" },
          { name: "negativeActions", type: "uint256" },
          { name: "commitmentRoot", type: "bytes32" },
          { name: "lastUpdate", type: "uint64" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "getTier",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "bytes32" }],
    outputs: [{ type: "uint8" }],
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
    name: "AttestationRecorded",
    inputs: [
      { name: "agentId", type: "bytes32", indexed: true },
      { name: "scoreDelta", type: "int256", indexed: false },
      { name: "newCommitmentRoot", type: "bytes32", indexed: false },
      { name: "actionHash", type: "bytes32", indexed: false },
      { name: "attester", type: "address", indexed: false },
    ],
  },
] as const;
