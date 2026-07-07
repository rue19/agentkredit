const hre = require("hardhat");

async function main() {
  const minBondAmount = hre.ethers.parseEther("0.1"); // 0.1 BOT minimum bond

  console.log("Deploying AgentRegistry...");
  const AgentRegistry = await hre.ethers.getContractFactory("AgentRegistry");
  const agentRegistry = await AgentRegistry.deploy(minBondAmount);
  await agentRegistry.waitForDeployment();

  const address = await agentRegistry.getAddress();
  console.log(`AgentRegistry deployed to: ${address}`);
  console.log(`Min bond amount: ${hre.ethers.formatEther(minBondAmount)} BOT`);

  // Wait for block explorer to index (optional)
  if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
    console.log("Waiting for block confirmation...");
    await agentRegistry.deploymentTransaction().wait(5);
    console.log("Verified! Check block explorer.");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
