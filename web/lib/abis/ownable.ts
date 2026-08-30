/*
  Every AgentKredit contract extends OpenZeppelin Ownable. `owner()` is the
  only real, on-chain permission the protocol exposes, so it is the only
  thing the app uses to decide whether a wallet is an administrator.
*/
export const ownableAbi = [
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
] as const;
