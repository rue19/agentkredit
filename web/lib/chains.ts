import { defineChain } from "viem";

/*
  Neither BOT Chain nor Bohr ships in viem/chains, so both are declared
  here. RPC URLs, chain IDs and explorers are taken verbatim from
  hardhat.config.js so the frontend and the deploy scripts can never
  disagree about what network they are talking to.
*/

export const bohrTestnet = defineChain({
  id: 968,
  name: "Bohr Testnet",
  nativeCurrency: { name: "BOT", symbol: "BOT", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.bohr.life"] } },
  blockExplorers: { default: { name: "Bohr Scan", url: "https://scan.bohr.life" } },
  testnet: true,
});

export const botchainTestnet = defineChain({
  id: 513100,
  name: "BOT Chain Testnet",
  nativeCurrency: { name: "BOT", symbol: "BOT", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.botchaintestnet.ai"] } },
  blockExplorers: {
    default: { name: "BOT Chain Explorer", url: "https://botchaintestnet.ai" },
  },
  testnet: true,
});

export const botchainMainnet = defineChain({
  id: 1891,
  name: "BOT Chain",
  nativeCurrency: { name: "BOT", symbol: "BOT", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.botchain.ai"] } },
  blockExplorers: {
    default: { name: "BOT Chain Explorer", url: "https://botchain.ai" },
  },
});

export const supportedChains = [bohrTestnet, botchainTestnet, botchainMainnet] as const;

/* Bohr is where deploy-testnet.js targets, so it is the app default. */
export const defaultChain = bohrTestnet;

export function isSupportedChain(id: number | undefined): id is SupportedChainId {
  return id !== undefined && supportedChains.some((c) => c.id === id);
}

/** The chain ids wagmi's config is typed against. */
export type SupportedChainId = (typeof supportedChains)[number]["id"];
