require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY || "0x" + "0".repeat(64);

module.exports = {
  solidity: {
    version: "0.8.26",
    settings: {
      evmVersion: "cancun",
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
    },
    botchainTestnet: {
      url: "https://rpc.botchaintestnet.ai",
      chainId: 513100,
      accounts: [DEPLOYER_PRIVATE_KEY],
      gasPrice: 1000000000, // 1 gwei
    },
    botchainMainnet: {
      url: "https://rpc.botchain.ai",
      chainId: 1891,
      accounts: [DEPLOYER_PRIVATE_KEY],
      gasPrice: 1000000000,
    },
  },
  etherscan: {
    apiKey: {
      botchainTestnet: process.env.BOTCHAIN_EXPLORER_API_KEY || "",
    },
    customChains: [
      {
        network: "botchainTestnet",
        chainId: 513100,
        urls: {
          apiURL: "https://botchaintestnet.ai/api",
          browserURL: "https://botchaintestnet.ai",
        },
      },
    ],
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS === "true",
    currency: "USD",
  },
};
