const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const snarkjs = require("snarkjs");
const { buildPoseidon } = require("circomlibjs");
const path = require("path");

describe("E2E Credit Flow", function () {
  this.timeout(120000);

  let poseidon;
  let F;

  before(async function () {
    poseidon = await buildPoseidon();
    F = poseidon.F;
  });

  async function buildHashChain(secret, results) {
    let state = F.toObject(poseidon([secret, 0n]));
    for (const result of results) {
      state = F.toObject(poseidon([state, BigInt(result)]));
    }
    return state;
  }

  async function deployFixture() {
    const [owner, lp, agentWallet, target, other] = await ethers.getSigners();

    // Deploy verifiers
    const SuccessRateVerifier = await ethers.getContractFactory("Groth16Verifier");
    const successRateVerifier = await SuccessRateVerifier.deploy();
    await successRateVerifier.waitForDeployment();

    const ZeroViolationsVerifier = await ethers.getContractFactory("ZeroViolationsGroth16Verifier");
    const zeroViolationsVerifier = await ZeroViolationsVerifier.deploy();
    await zeroViolationsVerifier.waitForDeployment();

    const ActionCountVerifier = await ethers.getContractFactory("ActionCountGroth16Verifier");
    const actionCountVerifier = await ActionCountVerifier.deploy();
    await actionCountVerifier.waitForDeployment();

    const ZKBehaviorVerifier = await ethers.getContractFactory("ZKBehaviorVerifier");
    const zkVerifier = await ZKBehaviorVerifier.deploy(
      await successRateVerifier.getAddress(),
      await zeroViolationsVerifier.getAddress(),
      await actionCountVerifier.getAddress()
    );
    await zkVerifier.waitForDeployment();

    // Deploy core contracts
    const LiquidityPool = await ethers.getContractFactory("LiquidityPool");
    const pool = await LiquidityPool.deploy();
    await pool.waitForDeployment();

    const AgentRegistry = await ethers.getContractFactory("AgentRegistry");
    const agentRegistry = await AgentRegistry.deploy(ethers.parseEther("0.1"));
    await agentRegistry.waitForDeployment();

    const ReputationRegistry = await ethers.getContractFactory("ReputationRegistry");
    const repRegistry = await ReputationRegistry.deploy(owner.address, 1);
    await repRegistry.waitForDeployment();

    const SessionKeyManager = await ethers.getContractFactory("SessionKeyManager");
    const skm = await SessionKeyManager.deploy();
    await skm.waitForDeployment();

    const CreditLine = await ethers.getContractFactory("CreditLine");
    const creditLine = await CreditLine.deploy(
      await pool.getAddress(),
      await repRegistry.getAddress(),
      await zkVerifier.getAddress()
    );
    await creditLine.waitForDeployment();

    const PolicyVault = await ethers.getContractFactory("PolicyVault");
    const vault = await PolicyVault.deploy(
      await skm.getAddress(),
      await creditLine.getAddress(),
      await pool.getAddress()
    );
    await vault.waitForDeployment();

    // Wire up
    await pool.setAuthorizedCaller(await creditLine.getAddress());
    await creditLine.setPolicyVault(await vault.getAddress());

    return {
      pool, agentRegistry, repRegistry, zkVerifier, skm, creditLine, vault,
      owner, lp, agentWallet, target, other,
      contracts: {
        pool, agentRegistry, repRegistry, zkVerifier, skm, creditLine, vault
      }
    };
  }

  it("full lifecycle: deposit → register → attest → credit → session key → spend → repay", async function () {
    const {
      pool, agentRegistry, repRegistry, zkVerifier, skm, creditLine, vault,
      owner, lp, agentWallet, target, other
    } = await loadFixture(deployFixture);

    const agentId = ethers.keccak256(ethers.toUtf8Bytes("agent-e2e-1"));
    const chainId = (await ethers.provider.getNetwork()).chainId;

    // ═══════════════════════════════════════════
    // 1. LP deposits 5000 BOT into LiquidityPool
    // ═══════════════════════════════════════════
    const depositAmount = ethers.parseEther("5000");
    await expect(
      pool.connect(lp).deposit({ value: depositAmount })
    ).to.emit(pool, "LiquidityDeposited").withArgs(lp.address, depositAmount);

    expect(await pool.totalDeposited()).to.equal(depositAmount);
    expect(await pool.getAvailableLiquidity()).to.equal(depositAmount);

    // ═══════════════════════════════════════════
    // 2. Agent registers with 0.1 ETH bond
    // ═══════════════════════════════════════════
    const bond = ethers.parseEther("0.1");
    await expect(
      agentRegistry.connect(agentWallet).registerAgent(agentId, { value: bond })
    ).to.emit(agentRegistry, "AgentRegistered");

    expect(await agentRegistry.isAgentActive(agentId)).to.be.true;

    // ═══════════════════════════════════════════
    // 3. Reputation attestation: +200 score (tier 1)
    // ═══════════════════════════════════════════
    const newRoot = ethers.keccak256(ethers.toUtf8Bytes("root-e2e"));
    const actionHash = ethers.keccak256(ethers.toUtf8Bytes("action-e2e-1"));

    const repSig = await owner.signTypedData(
      { name: "AgentKredit", version: "1", chainId, verifyingContract: await repRegistry.getAddress() },
      { Attestation: [
        { name: "agentId", type: "bytes32" },
        { name: "scoreDelta", type: "int256" },
        { name: "newCommitmentRoot", type: "bytes32" },
        { name: "actionHash", type: "bytes32" },
      ]},
      { agentId, scoreDelta: 200, newCommitmentRoot: newRoot, actionHash }
    );
    await repRegistry.connect(owner).recordAttestation(agentId, 200, newRoot, actionHash, repSig);

    expect(await repRegistry.getScore(agentId)).to.equal(200);
    expect(await repRegistry.getTier(agentId)).to.equal(1);

    // ═══════════════════════════════════════════
    // 4. Agent requests credit line (tier 1 → 1000 BOT)
    // ═══════════════════════════════════════════
    await expect(
      creditLine.connect(agentWallet).requestCreditLine(agentId)
    ).to.emit(creditLine, "CreditLineGranted");

    const credit = await creditLine.credits(agentId);
    expect(credit.totalCredit).to.equal(ethers.parseEther("1000"));
    expect(credit.status).to.equal(1); // Active
    expect(await creditLine.getRemainingCredit(agentId)).to.equal(ethers.parseEther("1000"));

    // ═══════════════════════════════════════════
    // 5. Set spending policy
    // ═══════════════════════════════════════════
    const selector = "0xa9059cbb"; // transfer(address,uint256)
    await vault.setPolicy(agentId, ethers.parseEther("200"), [target.address], [selector]);

    expect(await vault.getRemainingDailySpend(agentId)).to.equal(ethers.parseEther("200"));

    // ═══════════════════════════════════════════
    // 6. Grant session key
    // ═══════════════════════════════════════════
    const sessionId = ethers.keccak256(ethers.toUtf8Bytes("session-e2e-1"));
    const maxAmount = ethers.parseEther("200");
    const expiry = Math.floor(Date.now() / 1000) + 86400;

    const skDomain = {
      name: "SessionKeyManager",
      version: "1",
      chainId,
      verifyingContract: await skm.getAddress(),
    };
    const skSig = await owner.signTypedData(skDomain, {
      SessionKey: [
        { name: "signer", type: "address" },
        { name: "agentId", type: "bytes32" },
        { name: "maxAmount", type: "uint256" },
        { name: "expiry", type: "uint256" },
        { name: "nonce", type: "uint256" },
      ],
    }, {
      signer: agentWallet.address,
      agentId,
      maxAmount,
      expiry,
      nonce: 0,
    });

    await expect(
      skm.grantSessionKey(sessionId, agentWallet.address, agentId, maxAmount, expiry, skSig)
    ).to.emit(skm, "SessionKeyGranted");

    expect(await skm.isActiveSession(sessionId)).to.be.true;

    // ═══════════════════════════════════════════
    // 7. Generate ZK success-rate proof (85% success)
    // ═══════════════════════════════════════════
    const results = new Array(85).fill(1).concat(new Array(15).fill(0));
    const secret = 99999n;
    const minSuccessCount = 80;
    const commitmentRoot = await buildHashChain(secret, results);

    const zkInputs = {
      commitmentRoot: commitmentRoot.toString(),
      minSuccessCount: minSuccessCount.toString(),
      secret: secret.toString(),
      results: results.map(r => r.toString()),
    };

    const { proof: zkProof, publicSignals } = await snarkjs.groth16.fullProve(
      zkInputs,
      path.join(__dirname, "../build/success-rate/success-rate_js/success-rate.wasm"),
      path.join(__dirname, "../build/success-rate/success-rate_final.zkey")
    );

    const pA = [zkProof.pi_a[0], zkProof.pi_a[1]];
    const pB = [
      [zkProof.pi_b[0][1], zkProof.pi_b[0][0]],
      [zkProof.pi_b[1][1], zkProof.pi_b[1][0]],
    ];
    const pC = [zkProof.pi_c[0], zkProof.pi_c[1]];

    // ═══════════════════════════════════════════
    // 8. Agent executes spend via PolicyVault
    // ═══════════════════════════════════════════
    const spendAmount = ethers.parseEther("50");

    const callData = ethers.concat([
      selector,
      ethers.AbiCoder.defaultAbiCoder().encode(["address", "uint256"], [target.address, spendAmount]),
    ]);
    const callDataHash = ethers.keccak256(callData);

    const sessionSig = await agentWallet.signTypedData(skDomain, {
      SessionCall: [
        { name: "sessionId", type: "bytes32" },
        { name: "callDataHash", type: "bytes32" },
        { name: "nonce", type: "uint256" },
      ],
    }, {
      sessionId,
      callDataHash,
      nonce: 0,
    });

    await expect(
      vault.connect(agentWallet).executeSpend(
        agentId,
        sessionId,
        target.address,
        selector,
        spendAmount,
        callData,
        sessionSig,
        1, // CLAIM_SUCCESS_RATE
        encodeProof(pA, pB, pC),
        [
          ethers.zeroPadValue(ethers.toBeHex(commitmentRoot), 32),
          ethers.zeroPadValue(ethers.toBeHex(minSuccessCount), 32)
        ],
        { value: spendAmount }
      )
    ).to.emit(vault, "SpendExecuted");

    // Verify credit drawdown
    const creditAfterSpend = await creditLine.credits(agentId);
    expect(creditAfterSpend.drawdown).to.equal(spendAmount);
    expect(await creditLine.getRemainingCredit(agentId)).to.equal(ethers.parseEther("950"));

    // Verify daily usage updated
    expect(await vault.getRemainingDailySpend(agentId)).to.equal(ethers.parseEther("150"));

    // ═══════════════════════════════════════════
    // 9. Anyone repays 30 BOT
    // ═══════════════════════════════════════════
    const repayAmount = ethers.parseEther("30");
    await expect(
      creditLine.connect(other).repay(agentId, repayAmount, { value: repayAmount })
    ).to.emit(creditLine, "CreditRepaid");

    const creditAfterRepay = await creditLine.credits(agentId);
    expect(creditAfterRepay.drawdown).to.equal(ethers.parseEther("20"));

    // ═══════════════════════════════════════════
    // 10. Session key revocation
    // ═══════════════════════════════════════════
    await expect(
      skm.revokeSessionKey(sessionId)
    ).to.emit(skm, "SessionKeyRevoked");

    expect(await skm.isActiveSession(sessionId)).to.be.false;
  });

  function encodeProof(pA, pB, pC) {
    return ethers.AbiCoder.defaultAbiCoder().encode(
      ["uint256[2]", "uint256[2][2]", "uint256[2]"],
      [pA, pB, pC]
    );
  }
});
