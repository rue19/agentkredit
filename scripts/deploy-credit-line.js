const hre = require("hardhat");

async function main() {
  // Deploy verifiers first
  console.log("Deploying Groth16 verifiers...");

  const SuccessRateVerifier = await hre.ethers.getContractFactory("Groth16Verifier");
  const successRateVerifier = await SuccessRateVerifier.deploy();
  await successRateVerifier.waitForDeployment();
  console.log(`SuccessRateVerifier: ${await successRateVerifier.getAddress()}`);

  const ZeroViolationsVerifier = await hre.ethers.getContractFactory("ZeroViolationsGroth16Verifier");
  const zeroViolationsVerifier = await ZeroViolationsVerifier.deploy();
  await zeroViolationsVerifier.waitForDeployment();
  console.log(`ZeroViolationsVerifier: ${await zeroViolationsVerifier.getAddress()}`);

  const ActionCountVerifier = await hre.ethers.getContractFactory("ActionCountGroth16Verifier");
  const actionCountVerifier = await ActionCountVerifier.deploy();
  await actionCountVerifier.waitForDeployment();
  console.log(`ActionCountVerifier: ${await actionCountVerifier.getAddress()}`);

  // Deploy ZKBehaviorVerifier
  console.log("Deploying ZKBehaviorVerifier...");
  const ZKBehaviorVerifier = await hre.ethers.getContractFactory("ZKBehaviorVerifier");
  const zkVerifier = await ZKBehaviorVerifier.deploy(
    await successRateVerifier.getAddress(),
    await zeroViolationsVerifier.getAddress(),
    await actionCountVerifier.getAddress()
  );
  await zkVerifier.waitForDeployment();
  console.log(`ZKBehaviorVerifier: ${await zkVerifier.getAddress()}`);

  // Deploy CreditLine
  const poolAddress = process.env.LIQUIDITY_POOL_ADDRESS;
  const repRegistryAddress = process.env.REPUTATION_REGISTRY_ADDRESS;

  if (!poolAddress || !repRegistryAddress) {
    throw new Error("Set LIQUIDITY_POOL_ADDRESS and REPUTATION_REGISTRY_ADDRESS in .env");
  }

  console.log("Deploying CreditLine...");
  const CreditLine = await hre.ethers.getContractFactory("CreditLine");
  const creditLine = await CreditLine.deploy(poolAddress, repRegistryAddress, await zkVerifier.getAddress());
  await creditLine.waitForDeployment();

  const address = await creditLine.getAddress();
  console.log(`CreditLine deployed to: ${address}`);

  if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
    console.log("Waiting for block confirmation...");
    await creditLine.deploymentTransaction().wait(5);
  }

  return {
    successRateVerifier: await successRateVerifier.getAddress(),
    zeroViolationsVerifier: await zeroViolationsVerifier.getAddress(),
    actionCountVerifier: await actionCountVerifier.getAddress(),
    zkVerifier: await zkVerifier.getAddress(),
    creditLine: address,
  };
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { main };
