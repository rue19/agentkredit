const hre = require("hardhat");

async function main() {
  console.log("Deploying SessionKeyManager...");
  const SessionKeyManager = await hre.ethers.getContractFactory("SessionKeyManager");
  const skm = await SessionKeyManager.deploy();
  await skm.waitForDeployment();

  const address = await skm.getAddress();
  console.log(`SessionKeyManager deployed to: ${address}`);

  if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
    console.log("Waiting for block confirmation...");
    await skm.deploymentTransaction().wait(5);
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
