const hre = require("hardhat");

async function main() {
  const deployer = (await hre.ethers.getSigners())[0];
  console.log("Deployer:", deployer.address);
  console.log("Network:", hre.network.name);
  console.log("---");

  const addresses = {};

  // 1. Deploy LiquidityPool
  console.log("[1/5] Deploying LiquidityPool...");
  const LiquidityPool = await hre.ethers.getContractFactory("LiquidityPool");
  const pool = await LiquidityPool.deploy();
  await pool.waitForDeployment();
  addresses.liquidityPool = await pool.getAddress();
  console.log(`  LiquidityPool: ${addresses.liquidityPool}`);

  // 2. Deploy SessionKeyManager
  console.log("[2/5] Deploying SessionKeyManager...");
  const SessionKeyManager = await hre.ethers.getContractFactory("SessionKeyManager");
  const skm = await SessionKeyManager.deploy();
  await skm.waitForDeployment();
  addresses.sessionKeyManager = await skm.getAddress();
  console.log(`  SessionKeyManager: ${addresses.sessionKeyManager}`);

  // 3. Deploy verifiers + ZKBehaviorVerifier
  console.log("[3/5] Deploying verifiers...");

  const SuccessRateVerifier = await hre.ethers.getContractFactory("Groth16Verifier");
  const srv = await SuccessRateVerifier.deploy();
  await srv.waitForDeployment();
  addresses.successRateVerifier = await srv.getAddress();

  const ZeroViolationsVerifier = await hre.ethers.getContractFactory("ZeroViolationsGroth16Verifier");
  const zvv = await ZeroViolationsVerifier.deploy();
  await zvv.waitForDeployment();
  addresses.zeroViolationsVerifier = await zvv.getAddress();

  const ActionCountVerifier = await hre.ethers.getContractFactory("ActionCountGroth16Verifier");
  const acv = await ActionCountVerifier.deploy();
  await acv.waitForDeployment();
  addresses.actionCountVerifier = await acv.getAddress();

  const ZKBehaviorVerifier = await hre.ethers.getContractFactory("ZKBehaviorVerifier");
  const zkVerifier = await ZKBehaviorVerifier.deploy(
    addresses.successRateVerifier,
    addresses.zeroViolationsVerifier,
    addresses.actionCountVerifier
  );
  await zkVerifier.waitForDeployment();
  addresses.zkVerifier = await zkVerifier.getAddress();
  console.log(`  ZKBehaviorVerifier: ${addresses.zkVerifier}`);

  // 4. Deploy CreditLine
  // Need ReputationRegistry address from Phase 1 (set in env or pass as arg)
  const repRegistryAddress = process.env.REPUTATION_REGISTRY_ADDRESS;
  if (!repRegistryAddress) {
    throw new Error("Set REPUTATION_REGISTRY_ADDRESS in .env (deploy Phase 1 first)");
  }

  console.log("[4/5] Deploying CreditLine...");
  const CreditLine = await hre.ethers.getContractFactory("CreditLine");
  const creditLine = await CreditLine.deploy(
    addresses.liquidityPool,
    repRegistryAddress,
    addresses.zkVerifier
  );
  await creditLine.waitForDeployment();
  addresses.creditLine = await creditLine.getAddress();
  console.log(`  CreditLine: ${addresses.creditLine}`);

  // 5. Deploy PolicyVault
  console.log("[5/5] Deploying PolicyVault...");
  const PolicyVault = await hre.ethers.getContractFactory("PolicyVault");
  const vault = await PolicyVault.deploy(
    addresses.sessionKeyManager,
    addresses.creditLine,
    addresses.liquidityPool
  );
  await vault.waitForDeployment();
  addresses.policyVault = await vault.getAddress();
  console.log(`  PolicyVault: ${addresses.policyVault}`);

  // Wire up: set authorized caller on LiquidityPool
  console.log("\nWiring up contracts...");
  await pool.setAuthorizedCaller(addresses.creditLine);
  console.log("  LiquidityPool.setAuthorizedCaller → CreditLine");

  await creditLine.setPolicyVault(addresses.policyVault);
  console.log("  CreditLine.setPolicyVault → PolicyVault");

  // Summary
  console.log("\n=== Phase 3 Deployment Complete ===");
  console.log(JSON.stringify(addresses, null, 2));

  if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
    console.log("\nWaiting for confirmations...");
    const tx = vault.deploymentTransaction();
    if (tx) await tx.wait(5);
  }

  return addresses;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
