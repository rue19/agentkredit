/*
  `injected` is imported from the wagmi root rather than "wagmi/connectors":
  that barrel also pulls in the Coinbase Base Account SDK, whose optional
  x402 peer deps are unresolvable and break the build.
*/
import { createConfig, http, injected } from "wagmi";
import { bohrTestnet, botchainMainnet, botchainTestnet } from "./chains";

export const wagmiConfig = createConfig({
  chains: [bohrTestnet, botchainTestnet, botchainMainnet],
  connectors: [injected({ shimDisconnect: true })],
  transports: {
    [bohrTestnet.id]: http(),
    [botchainTestnet.id]: http(),
    [botchainMainnet.id]: http(),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
