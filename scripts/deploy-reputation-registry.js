const hre = require("hardhat");

async function main() {
  // For demo: single attester with threshold of 1
  // In production: multiple attesters with threshold > 1
  const initialAttester = process.env.INITIAL_ATTESTER_ADDRESS;
  const requiredAttestations = 1;

  if (!initialAttester) {
    console.error("Set INITIAL_ATTESTER_ADDRESS in .env");
    process.exit(1);
  }

  console.log("Deploying ReputationRegistry...");
  const ReputationRegistry = await hre.ethers.getContractFactory("ReputationRegistry");
  const reputationRegistry = await ReputationRegistry.deploy(initialAttester, requiredAttestations);
  await reputationRegistry.waitForDeployment();

  const address = await reputationRegistry.getAddress();
  console.log(`ReputationRegistry deployed to: ${address}`);
  console.log(`Initial attester: ${initialAttester}`);
  console.log(`Required attestations: ${requiredAttestations}`);

  if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
    console.log("Waiting for block confirmation...");
    await reputationRegistry.deploymentTransaction().wait(5);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
