const { ethers } = require("hardhat");
const snarkjs = require("snarkjs");
const { buildPoseidon } = require("circomlibjs");
const path = require("path");

const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";

function log(emoji, msg) { console.log(`${emoji} ${msg}`); }
function step(n, msg) { console.log(`\n${BOLD}${CYAN}═══ Step ${n} ═══${RESET} ${BOLD}${msg}${RESET}`); }
function pause(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const [deployer, agentWallet, lp, target] = await ethers.getSigners();
  const chainId = (await ethers.provider.getNetwork()).chainId;

  console.log(`${BOLD}${GREEN}`);
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║        AgentKredit — Full Demo Flow          ║");
  console.log("╚══════════════════════════════════════════════╝");
  console.log(`${RESET}`);
  console.log(`${DIM}Deployer:  ${deployer.address}`);
  console.log(`Agent:     ${agentWallet.address}`);
  console.log(`LP:        ${lp.address}`);
  console.log(`Target:    ${target.address}${RESET}\n`);

  // ═══════════════════════════════════════
  step(1, "Deploying all contracts");
  // ═══════════════════════════════════════

  const LiquidityPool = await ethers.getContractFactory("LiquidityPool");
  const pool = await LiquidityPool.deploy(); await pool.waitForDeployment();
  log("✅", `LiquidityPool:     ${GREEN}${await pool.getAddress()}${RESET}`);

  const SessionKeyManager = await ethers.getContractFactory("SessionKeyManager");
  const skm = await SessionKeyManager.deploy(); await skm.waitForDeployment();
  log("✅", `SessionKeyManager: ${GREEN}${await skm.getAddress()}${RESET}`);

  const SRV = await ethers.getContractFactory("Groth16Verifier");
  const srv = await SRV.deploy(); await srv.waitForDeployment();
  log("✅", `SuccessRateVerifier: ${GREEN}${await srv.getAddress()}${RESET}`);

  const ZVV = await ethers.getContractFactory("ZeroViolationsGroth16Verifier");
  const zvv = await ZVV.deploy(); await zvv.waitForDeployment();
  log("✅", `ZeroViolationsVerifier: ${GREEN}${await zvv.getAddress()}${RESET}`);

  const ACV = await ethers.getContractFactory("ActionCountGroth16Verifier");
  const acv = await ACV.deploy(); await acv.waitForDeployment();
  log("✅", `ActionCountVerifier: ${GREEN}${await acv.getAddress()}${RESET}`);

  const ZK = await ethers.getContractFactory("ZKBehaviorVerifier");
  const zk = await ZK.deploy(await srv.getAddress(), await zvv.getAddress(), await acv.getAddress());
  await zk.waitForDeployment();
  log("✅", `ZKBehaviorVerifier: ${GREEN}${await zk.getAddress()}${RESET}`);

  const RepReg = await ethers.getContractFactory("ReputationRegistry");
  const rep = await RepReg.deploy(deployer.address, 1); await rep.waitForDeployment();
  log("✅", `ReputationRegistry: ${GREEN}${await rep.getAddress()}${RESET}`);

  const CreditLine = await ethers.getContractFactory("CreditLine");
  const cl = await CreditLine.deploy(await pool.getAddress(), await rep.getAddress(), await zk.getAddress());
  await cl.waitForDeployment();
  log("✅", `CreditLine:       ${GREEN}${await cl.getAddress()}${RESET}`);

  const PolicyVault = await ethers.getContractFactory("PolicyVault");
  const pv = await PolicyVault.deploy(await skm.getAddress(), await cl.getAddress(), await pool.getAddress());
  await pv.waitForDeployment();
  log("✅", `PolicyVault:      ${GREEN}${await pv.getAddress()}${RESET}`);

  const tx = await pool.setAuthorizedCaller(await cl.getAddress()); await tx.wait();
  log("🔗", `LiquidityPool.setAuthorizedCaller → CreditLine`);

  // ═══════════════════════════════════════
  step(2, "LP deposits 5,000 ETH into LiquidityPool");
  // ═══════════════════════════════════════

  const depositAmount = ethers.parseEther("5000");
  const depTx = await pool.connect(lp).deposit({ value: depositAmount }); await depTx.wait();
  log("💰", `Deposited: ${GREEN}5,000 ETH${RESET}`);
  log("📊", `Available liquidity: ${GREEN}${ethers.formatEther(await pool.getAvailableLiquidity())} ETH${RESET}`);

  // ═══════════════════════════════════════
  step(3, "Agent registers with 0.1 ETH bond");
  // ═══════════════════════════════════════

  const AgentRegistry = await ethers.getContractFactory("AgentRegistry");
  const agentReg = await AgentRegistry.deploy(ethers.parseEther("0.1"));
  await agentReg.waitForDeployment();
  const agentId = ethers.keccak256(ethers.toUtf8Bytes("demo-agent-1"));
  const regTx = await agentReg.connect(agentWallet).registerAgent(agentId, { value: ethers.parseEther("0.1") });
  await regTx.wait();
  log("🤖", `Agent registered: ${GREEN}${agentId.slice(0, 20)}...${RESET}`);
  log("🔒", `Bond staked: 0.1 ETH`);

  // ═══════════════════════════════════════
  step(4, "Reputation attestation → Tier 1 (score: 150)");
  // ═══════════════════════════════════════

  const newRoot = ethers.keccak256(ethers.toUtf8Bytes("root-demo"));
  const actionHash = ethers.keccak256(ethers.toUtf8Bytes("action-demo-1"));
  const repSig = await deployer.signTypedData(
    { name: "AgentKredit", version: "1", chainId, verifyingContract: await rep.getAddress() },
    { Attestation: [
      { name: "agentId", type: "bytes32" },
      { name: "scoreDelta", type: "int256" },
      { name: "newCommitmentRoot", type: "bytes32" },
      { name: "actionHash", type: "bytes32" },
    ]},
    { agentId, scoreDelta: 150, newCommitmentRoot: newRoot, actionHash }
  );
  const attTx = await rep.connect(deployer).recordAttestation(agentId, 150, newRoot, actionHash, repSig);
  await attTx.wait();
  const score = await rep.getScore(agentId);
  const tier = await rep.getTier(agentId);
  log("✍️", `Attestation submitted: +150 score`);
  log("📊", `Score: ${GREEN}${score}${RESET} | Tier: ${GREEN}${tier}${RESET}`);

  // ═══════════════════════════════════════
  step(5, "Agent requests credit line (Tier 1 → 1,000 ETH)");
  // ═══════════════════════════════════════

  const creditTx = await cl.connect(agentWallet).requestCreditLine(agentId); await creditTx.wait();
  const credit = await cl.credits(agentId);
  log("💳", `Credit granted: ${GREEN}${ethers.formatEther(credit.totalCredit)} ETH${RESET}`);
  log("📅", `Expires: ${new Date(Number(credit.expiry) * 1000).toISOString().split('T')[0]}`);

  // ═══════════════════════════════════════
  step(6, "Set spending policy");
  // ═══════════════════════════════════════

  const selector = "0xa9059cbb";
  const polTx = await pv.setPolicy(agentId, ethers.parseEther("200"), [target.address], [selector]);
  await polTx.wait();
  log("📋", `Daily limit: ${GREEN}200 ETH${RESET}`);
  log("🎯", `Allowed target: ${target.address.slice(0, 20)}...`);
  log("🔑", `Allowed selector: ${selector}`);

  // ═══════════════════════════════════════
  step(7, "Grant session key to agent");
  // ═══════════════════════════════════════

  const sessionId = ethers.keccak256(ethers.toUtf8Bytes("session-demo-1"));
  const maxAmount = ethers.parseEther("200");
  const expiry = Math.floor(Date.now() / 1000) + 86400;

  const skSig = await deployer.signTypedData(
    { name: "SessionKeyManager", version: "1", chainId, verifyingContract: await skm.getAddress() },
    { SessionKey: [
      { name: "signer", type: "address" },
      { name: "agentId", type: "bytes32" },
      { name: "maxAmount", type: "uint256" },
      { name: "expiry", type: "uint256" },
      { name: "nonce", type: "uint256" },
    ]},
    { signer: agentWallet.address, agentId, maxAmount, expiry, nonce: 0 }
  );
  const skTx = await skm.grantSessionKey(sessionId, agentWallet.address, agentId, maxAmount, expiry, skSig);
  await skTx.wait();
  log("🔑", `Session key granted to ${GREEN}${agentWallet.address.slice(0, 20)}...${RESET}`);
  log("⏱️", `Expires: ${new Date(expiry * 1000).toISOString().split('T')[0]}`);

  // ═══════════════════════════════════════
  step(8, "Generate ZK proof (success rate ≥ 80%)");
  // ═══════════════════════════════════════

  log("🧮", "Building Poseidon hash chain for 100 actions...");
  const poseidon = await buildPoseidon();
  const F = poseidon.F;
  const results = new Array(85).fill(1).concat(new Array(15).fill(0));
  const secret = 42n;
  let state = F.toObject(poseidon([secret, 0n]));
  for (const r of results) { state = F.toObject(poseidon([state, BigInt(r)])); }
  log("✅", `Hash chain built: ${YELLOW}commitmentRoot = ${state.toString().slice(0, 20)}...${RESET}`);

  log("🔐", "Generating Groth16 proof (success-rate circuit)...");
  const { proof: zkProof, publicSignals } = await snarkjs.groth16.fullProve(
    {
      commitmentRoot: state.toString(),
      minSuccessCount: "80",
      secret: secret.toString(),
      results: results.map(r => r.toString()),
    },
    path.join(__dirname, "../build/success-rate/success-rate_js/success-rate.wasm"),
    path.join(__dirname, "../build/success-rate/success-rate_final.zkey")
  );
  log("✅", `Proof generated ${YELLOW}(~7s)${RESET}`);
  log("📤", `Public signals: [commitmentRoot, minSuccessCount=80]`);

  // ═══════════════════════════════════════
  step(9, "Execute autonomous spend via PolicyVault");
  // ═══════════════════════════════════════

  const spendAmount = ethers.parseEther("50");

  const callData = ethers.concat([
    selector,
    ethers.AbiCoder.defaultAbiCoder().encode(["address", "uint256"], [target.address, spendAmount]),
  ]);
  const callDataHash = ethers.keccak256(callData);

  const sessionSig = await agentWallet.signTypedData(
    { name: "SessionKeyManager", version: "1", chainId, verifyingContract: await skm.getAddress() },
    { SessionCall: [
      { name: "sessionId", type: "bytes32" },
      { name: "callDataHash", type: "bytes32" },
      { name: "nonce", type: "uint256" },
    ]},
    { sessionId, callDataHash, nonce: 0 }
  );

  const pA = [zkProof.pi_a[0], zkProof.pi_a[1]];
  const pB = [[zkProof.pi_b[0][1], zkProof.pi_b[0][0]], [zkProof.pi_b[1][1], zkProof.pi_b[1][0]]];
  const pC = [zkProof.pi_c[0], zkProof.pi_c[1]];
  const proofBytes = ethers.AbiCoder.defaultAbiCoder().encode(
    ["uint256[2]", "uint256[2][2]", "uint256[2]"], [pA, pB, pC]
  );

  const spendTx = await pv.connect(agentWallet).executeSpend(
    agentId, sessionId, target.address, selector, spendAmount,
    callData, sessionSig, 1, proofBytes,
    [ethers.zeroPadValue(ethers.toBeHex(state), 32), ethers.zeroPadValue(ethers.toBeHex(80n), 32)],
    { value: spendAmount }
  );
  const receipt = await spendTx.wait();

  log("💸", `Autonomous spend: ${GREEN}${ethers.formatEther(spendAmount)} ETH${RESET}`);
  log("📜", `Tx hash: ${YELLOW}${receipt.hash}${RESET}`);
  log("📊", `Credit remaining: ${GREEN}${ethers.formatEther(await cl.getRemainingCredit(agentId))} ETH${RESET}`);
  log("📅", `Daily remaining: ${GREEN}${ethers.formatEther(await pv.getRemainingDailySpend(agentId))} ETH${RESET}`);

  // ═══════════════════════════════════════
  step(10, "Anyone repays 20 ETH");
  // ═══════════════════════════════════════

  const repayAmount = ethers.parseEther("20");
  const repayTx = await cl.connect(lp).repay(agentId, repayAmount, { value: repayAmount });
  await repayTx.wait();
  const finalCredit = await cl.credits(agentId);
  log("💵", `Repaid: ${GREEN}${ethers.formatEther(repayAmount)} ETH${RESET}`);
  log("📊", `Outstanding drawdown: ${GREEN}${ethers.formatEther(finalCredit.drawdown)} ETH${RESET}`);

  // ═══════════════════════════════════════
  console.log(`\n${BOLD}${GREEN}╔══════════════════════════════════════════════╗`);
  console.log(`║         Demo Complete — All Steps Done       ║`);
  console.log(`╚══════════════════════════════════════════════╝${RESET}\n`);

  console.log(`${BOLD}Contract Addresses:${RESET}`);
  console.log(`  LiquidityPool:     ${await pool.getAddress()}`);
  console.log(`  SessionKeyManager: ${await skm.getAddress()}`);
  console.log(`  ZKBehaviorVerifier:${await zk.getAddress()}`);
  console.log(`  CreditLine:        ${await cl.getAddress()}`);
  console.log(`  PolicyVault:       ${await pv.getAddress()}`);
  console.log(`  ReputationRegistry:${await rep.getAddress()}`);
  console.log(`\n${BOLD}Spend Tx Hash:${RESET} ${receipt.hash}\n`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => { console.error(error); process.exit(1); });
