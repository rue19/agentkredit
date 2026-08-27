const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const deployer = (await hre.ethers.getSigners())[0];
  console.log("Deployer:", deployer.address);
  console.log("Network:", hre.network.name, `(chainId ${hre.network.config.chainId})`);
  console.log("Balance:", hre.ethers.formatEther(await hre.ethers.provider.getBalance(deployer.address)), "BOT");
  console.log("---");

  const addresses = {};
  const isLive = hre.network.name !== "hardhat" && hre.network.name !== "localhost";

  // ═══════════════════════════════════════════
  // Phase 1: Trust Core
  // ═══════════════════════════════════════════

  // 1. AgentRegistry
  console.log("[1/11] Deploying AgentRegistry...");
  const minBondAmount = hre.ethers.parseEther("0.1");
  const AgentRegistry = await hre.ethers.getContractFactory("AgentRegistry");
  const agentRegistry = await AgentRegistry.deploy(minBondAmount);
  await agentRegistry.waitForDeployment();
  addresses.agentRegistry = await agentRegistry.getAddress();
  console.log(`  AgentRegistry: ${addresses.agentRegistry}`);

  // 2. ReputationRegistry
  const initialAttester = process.env.INITIAL_ATTESTER_ADDRESS || deployer.address;
  console.log("[2/11] Deploying ReputationRegistry...");
  const ReputationRegistry = await hre.ethers.getContractFactory("ReputationRegistry");
  const reputationRegistry = await ReputationRegistry.deploy(initialAttester, 1);
  await reputationRegistry.waitForDeployment();
  addresses.reputationRegistry = await reputationRegistry.getAddress();
  console.log(`  ReputationRegistry: ${addresses.reputationRegistry}`);
  console.log(`  Initial attester: ${initialAttester}`);

  // ═══════════════════════════════════════════
  // Phase 2: ZK Proof Layer
  // ═══════════════════════════════════════════

  // 3. Groth16 Verifiers
  console.log("[3/11] Deploying Groth16 Verifiers...");

  const SuccessRateVerifier = await hre.ethers.getContractFactory("Groth16Verifier");
  const srv = await SuccessRateVerifier.deploy();
  await srv.waitForDeployment();
  addresses.successRateVerifier = await srv.getAddress();
  console.log(`  SuccessRateVerifier: ${addresses.successRateVerifier}`);

  const ZeroViolationsVerifier = await hre.ethers.getContractFactory("ZeroViolationsGroth16Verifier");
  const zvv = await ZeroViolationsVerifier.deploy();
  await zvv.waitForDeployment();
  addresses.zeroViolationsVerifier = await zvv.getAddress();
  console.log(`  ZeroViolationsVerifier: ${addresses.zeroViolationsVerifier}`);

  const ActionCountVerifier = await hre.ethers.getContractFactory("ActionCountGroth16Verifier");
  const acv = await ActionCountVerifier.deploy();
  await acv.waitForDeployment();
  addresses.actionCountVerifier = await acv.getAddress();
  console.log(`  ActionCountVerifier: ${addresses.actionCountVerifier}`);

  // 4. ZKBehaviorVerifier
  console.log("[4/11] Deploying ZKBehaviorVerifier...");
  const ZKBehaviorVerifier = await hre.ethers.getContractFactory("ZKBehaviorVerifier");
  const zkVerifier = await ZKBehaviorVerifier.deploy(
    addresses.successRateVerifier,
    addresses.zeroViolationsVerifier,
    addresses.actionCountVerifier
  );
  await zkVerifier.waitForDeployment();
  addresses.zkVerifier = await zkVerifier.getAddress();
  console.log(`  ZKBehaviorVerifier: ${addresses.zkVerifier}`);

  // ═══════════════════════════════════════════
  // Phase 3: Credit + Policy Enforcement
  // ═══════════════════════════════════════════

  // 5. LiquidityPool
  console.log("[5/11] Deploying LiquidityPool...");
  const LiquidityPool = await hre.ethers.getContractFactory("LiquidityPool");
  const pool = await LiquidityPool.deploy();
  await pool.waitForDeployment();
  addresses.liquidityPool = await pool.getAddress();
  console.log(`  LiquidityPool: ${addresses.liquidityPool}`);

  // 6. SessionKeyManager
  console.log("[6/11] Deploying SessionKeyManager...");
  const SessionKeyManager = await hre.ethers.getContractFactory("SessionKeyManager");
  const skm = await SessionKeyManager.deploy();
  await skm.waitForDeployment();
  addresses.sessionKeyManager = await skm.getAddress();
  console.log(`  SessionKeyManager: ${addresses.sessionKeyManager}`);

  // 7. CreditLine
  console.log("[7/11] Deploying CreditLine...");
  const CreditLine = await hre.ethers.getContractFactory("CreditLine");
  const creditLine = await CreditLine.deploy(
    addresses.liquidityPool,
    addresses.reputationRegistry,
    addresses.zkVerifier
  );
  await creditLine.waitForDeployment();
  addresses.creditLine = await creditLine.getAddress();
  console.log(`  CreditLine: ${addresses.creditLine}`);

  // 8. PolicyVault
  console.log("[8/11] Deploying PolicyVault...");
  const PolicyVault = await hre.ethers.getContractFactory("PolicyVault");
  const vault = await PolicyVault.deploy(
    addresses.sessionKeyManager,
    addresses.creditLine,
    addresses.liquidityPool
  );
  await vault.waitForDeployment();
  addresses.policyVault = await vault.getAddress();
  console.log(`  PolicyVault: ${addresses.policyVault}`);

  // ═══════════════════════════════════════════
  // Wiring: Link contracts together
  // ═══════════════════════════════════════════

  console.log("\n--- Wiring contracts ---");

  console.log("[9/11] LiquidityPool.setAuthorizedCaller(CreditLine)...");
  let tx = await pool.setAuthorizedCaller(addresses.creditLine);
  await tx.wait();
  console.log(`  tx: ${tx.hash}`);

  console.log("[10/11] CreditLine.setPolicyVault(PolicyVault)...");
  tx = await creditLine.setPolicyVault(addresses.policyVault);
  await tx.wait();
  console.log(`  tx: ${tx.hash}`);

  // ═══════════════════════════════════════════
  // Save deployed addresses
  // ═══════════════════════════════════════════

  console.log("\n[11/11] Saving deployment addresses...");

  const deployment = {
    network: hre.network.name,
    chainId: hre.network.config.chainId,
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
    contracts: addresses,
  };

  const outputPath = path.join(__dirname, "..", "deployed-addresses.json");
  fs.writeFileSync(outputPath, JSON.stringify(deployment, null, 2));
  console.log(`  Saved to: ${outputPath}`);

  // ═══════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════

  console.log("\n=== Deployment Complete ===");
  console.log(JSON.stringify(addresses, null, 2));

  if (isLive) {
    console.log("\nWaiting for confirmations...");
    const tx2 = vault.deploymentTransaction();
    if (tx2) await tx2.wait(5);
    console.log("Confirmed.");
  }

  return addresses;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
