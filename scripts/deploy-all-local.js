const hre = require("hardhat");

async function main() {
  const deployer = (await hre.ethers.getSigners())[0];
  console.log("Deployer:", deployer.address);
  console.log("---");

  // 1. LiquidityPool
  const LiquidityPool = await hre.ethers.getContractFactory("LiquidityPool");
  const pool = await LiquidityPool.deploy();
  await pool.waitForDeployment();
  const poolAddr = await pool.getAddress();
  console.log("LiquidityPool:", poolAddr);

  // 2. SessionKeyManager
  const SessionKeyManager = await hre.ethers.getContractFactory("SessionKeyManager");
  const skm = await SessionKeyManager.deploy();
  await skm.waitForDeployment();
  const skmAddr = await skm.getAddress();
  console.log("SessionKeyManager:", skmAddr);

  // 3. Verifiers
  const SRV = await hre.ethers.getContractFactory("Groth16Verifier");
  const srv = await SRV.deploy(); await srv.waitForDeployment();
  console.log("SuccessRateVerifier:", await srv.getAddress());

  const ZVV = await hre.ethers.getContractFactory("ZeroViolationsGroth16Verifier");
  const zvv = await ZVV.deploy(); await zvv.waitForDeployment();
  console.log("ZeroViolationsVerifier:", await zvv.getAddress());

  const ACV = await hre.ethers.getContractFactory("ActionCountGroth16Verifier");
  const acv = await ACV.deploy(); await acv.waitForDeployment();
  console.log("ActionCountVerifier:", await acv.getAddress());

  // 4. ZKBehaviorVerifier
  const ZK = await hre.ethers.getContractFactory("ZKBehaviorVerifier");
  const zk = await ZK.deploy(await srv.getAddress(), await zvv.getAddress(), await acv.getAddress());
  await zk.waitForDeployment();
  const zkAddr = await zk.getAddress();
  console.log("ZKBehaviorVerifier:", zkAddr);

  // 5. CreditLine (needs ReputationRegistry — deploy a stub)
  const RepReg = await hre.ethers.getContractFactory("ReputationRegistry");
  const rep = await RepReg.deploy(deployer.address, 1);
  await rep.waitForDeployment();
  const repAddr = await rep.getAddress();
  console.log("ReputationRegistry:", repAddr);

  const CreditLine = await hre.ethers.getContractFactory("CreditLine");
  const cl = await CreditLine.deploy(poolAddr, repAddr, zkAddr);
  await cl.waitForDeployment();
  const clAddr = await cl.getAddress();
  console.log("CreditLine:", clAddr);

  // 6. PolicyVault
  const PolicyVault = await hre.ethers.getContractFactory("PolicyVault");
  const pv = await PolicyVault.deploy(skmAddr, clAddr, poolAddr);
  await pv.waitForDeployment();
  const pvAddr = await pv.getAddress();
  console.log("PolicyVault:", pvAddr);

  // 7. Wire up
  const tx = await pool.setAuthorizedCaller(clAddr);
  await tx.wait();
  console.log("LiquidityPool.setAuthorizedCaller(CreditLine):", tx.hash);

  console.log("\n=== ALL DEPLOYED ===");
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
