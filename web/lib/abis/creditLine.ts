/*
  Transcribed from contracts/CreditLine.sol.

  `credits` is the auto-generated getter for the public
  `mapping(bytes32 => Credit)`, so it returns the struct fields flattened;
  `status` is the Status enum, which the ABI encodes as uint8.
*/
export const creditLineAbi = [
  {
    type: "function",
    name: "credits",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "bytes32" }],
    outputs: [
      { name: "totalCredit", type: "uint256" },
      { name: "drawdown", type: "uint256" },
      { name: "status", type: "uint8" },
      { name: "expiry", type: "uint256" },
      { name: "lastProofTime", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "getRemainingCredit",
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
    name: "CreditLineGranted",
    inputs: [
      { name: "agentId", type: "bytes32", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "CreditDrawnDown",
    inputs: [
      { name: "agentId", type: "bytes32", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "newDrawdown", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "CreditRepaid",
    inputs: [
      { name: "agentId", type: "bytes32", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "remaining", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "CreditExpired",
    inputs: [{ name: "agentId", type: "bytes32", indexed: true }],
  },
  {
    type: "event",
    name: "CreditRevoked",
    inputs: [
      { name: "agentId", type: "bytes32", indexed: true },
      { name: "reason", type: "string", indexed: false },
    ],
  },
] as const;
