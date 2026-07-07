const hre = require("hardhat");

async function main() {
  const sessionKeyManagerAddress = process.env.SESSION_KEY_MANAGER_ADDRESS;
  const creditLineAddress = process.env.CREDIT_LINE_ADDRESS;
  const liquidityPoolAddress = process.env.LIQUIDITY_POOL_ADDRESS;

  if (!sessionKeyManagerAddress || !creditLineAddress || !liquidityPoolAddress) {
    throw new Error("Set SESSION_KEY_MANAGER_ADDRESS, CREDIT_LINE_ADDRESS, LIQUIDITY_POOL_ADDRESS in .env");
  }

  console.log("Deploying PolicyVault...");
  const PolicyVault = await hre.ethers.getContractFactory("PolicyVault");
  const vault = await PolicyVault.deploy(sessionKeyManagerAddress, creditLineAddress, liquidityPoolAddress);
  await vault.waitForDeployment();

  const address = await vault.getAddress();
  console.log(`PolicyVault deployed to: ${address}`);

  if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
    console.log("Waiting for block confirmation...");
    await vault.deploymentTransaction().wait(5);
  }

  return address;
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
