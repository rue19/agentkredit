const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("CreditLine", function () {
  async function deployFixture() {
    const [owner, agent1, lp1, other] = await ethers.getSigners();

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

    const LiquidityPool = await ethers.getContractFactory("LiquidityPool");
    const pool = await LiquidityPool.deploy();
    await pool.waitForDeployment();

    const AgentRegistry = await ethers.getContractFactory("AgentRegistry");
    const agentRegistry = await AgentRegistry.deploy(ethers.parseEther("0.1"));
    await agentRegistry.waitForDeployment();

    const ReputationRegistry = await ethers.getContractFactory("ReputationRegistry");
    const repRegistry = await ReputationRegistry.deploy(owner.address, 1);
    await repRegistry.waitForDeployment();

    const CreditLine = await ethers.getContractFactory("CreditLine");
    const creditLine = await CreditLine.deploy(
      await pool.getAddress(),
      await repRegistry.getAddress(),
      await zkVerifier.getAddress()
    );
    await creditLine.waitForDeployment();

    // Setup
    await pool.setAuthorizedCaller(await creditLine.getAddress());

    // Register agent
    const agentId = ethers.keccak256(ethers.toUtf8Bytes("agent-1"));
    await agentRegistry.connect(agent1).registerAgent(agentId, { value: ethers.parseEther("0.1") });

    // Deposit liquidity
    await pool.connect(lp1).deposit({ value: ethers.parseEther("1000") });

    // Bootstrap reputation with +150 score (tier 1: score >= 100)
    const newRoot = ethers.keccak256(ethers.toUtf8Bytes("root-1"));
    const actionHash = ethers.keccak256(ethers.toUtf8Bytes("action-1"));
    const sig = await owner.signTypedData(
      { name: "AgentKredit", version: "1", chainId: (await ethers.provider.getNetwork()).chainId, verifyingContract: await repRegistry.getAddress() },
      { Attestation: [
        { name: "agentId", type: "bytes32" },
        { name: "scoreDelta", type: "int256" },
        { name: "newCommitmentRoot", type: "bytes32" },
        { name: "actionHash", type: "bytes32" },
      ]},
      { agentId, scoreDelta: 150, newCommitmentRoot: newRoot, actionHash }
    );
    await repRegistry.connect(owner).recordAttestation(agentId, 150, newRoot, actionHash, sig);

    return { pool, agentRegistry, repRegistry, zkVerifier, creditLine, owner, agent1, lp1, other, agentId };
  }

  describe("Deployment", function () {
    it("should set correct tier limits", async function () {
      const { creditLine } = await loadFixture(deployFixture);
      expect(await creditLine.tierLimits(1)).to.equal(ethers.parseEther("1000"));
      expect(await creditLine.tierLimits(2)).to.equal(ethers.parseEther("10000"));
      expect(await creditLine.tierLimits(3)).to.equal(ethers.parseEther("100000"));
    });

    it("should set correct tier score thresholds", async function () {
      const { creditLine } = await loadFixture(deployFixture);
      expect(await creditLine.tierScoreThresholds(1)).to.equal(100);
      expect(await creditLine.tierScoreThresholds(2)).to.equal(500);
      expect(await creditLine.tierScoreThresholds(3)).to.equal(1000);
    });
  });

  describe("Credit Line Request", function () {
    it("should grant credit line for registered agent", async function () {
      const { creditLine, agent1, agentId } = await loadFixture(deployFixture);

      await expect(
        creditLine.connect(agent1).requestCreditLine(agentId)
      ).to.emit(creditLine, "CreditLineGranted");

      const credit = await creditLine.credits(agentId);
      expect(credit.totalCredit).to.equal(ethers.parseEther("1000"));
      expect(credit.status).to.equal(1); // Active
    });

    it("should reject duplicate credit request", async function () {
      const { creditLine, agent1, agentId } = await loadFixture(deployFixture);
      await creditLine.connect(agent1).requestCreditLine(agentId);

      await expect(
        creditLine.connect(agent1).requestCreditLine(agentId)
      ).to.be.revertedWithCustomError(creditLine, "CreditAlreadyExists");
    });
  });

  describe("Drawdown", function () {
    it("should allow drawdown within credit limit", async function () {
      const { creditLine, agent1, agentId } = await loadFixture(deployFixture);
      await creditLine.connect(agent1).requestCreditLine(agentId);

      await expect(
        creditLine.connect(agent1).drawdown(agentId, ethers.parseEther("100"))
      ).to.emit(creditLine, "CreditDrawnDown");

      const credit = await creditLine.credits(agentId);
      expect(credit.drawdown).to.equal(ethers.parseEther("100"));
    });

    it("should reject drawdown exceeding credit limit", async function () {
      const { creditLine, agent1, agentId } = await loadFixture(deployFixture);
      await creditLine.connect(agent1).requestCreditLine(agentId);

      await expect(
        creditLine.connect(agent1).drawdown(agentId, ethers.parseEther("2000"))
      ).to.be.revertedWithCustomError(creditLine, "CreditLimitExceeded");
    });
  });

  describe("Repayment", function () {
    it("should allow anyone to repay credit", async function () {
      const { creditLine, agent1, other, agentId } = await loadFixture(deployFixture);
      await creditLine.connect(agent1).requestCreditLine(agentId);
      await creditLine.connect(agent1).drawdown(agentId, ethers.parseEther("500"));

      await expect(
        creditLine.connect(other).repay(agentId, ethers.parseEther("200"), { value: ethers.parseEther("200") })
      ).to.emit(creditLine, "CreditRepaid");

      const credit = await creditLine.credits(agentId);
      expect(credit.drawdown).to.equal(ethers.parseEther("300"));
    });

    it("should reject repayment exceeding outstanding amount", async function () {
      const { creditLine, agent1, other, agentId } = await loadFixture(deployFixture);
      await creditLine.connect(agent1).requestCreditLine(agentId);
      await creditLine.connect(agent1).drawdown(agentId, ethers.parseEther("100"));

      await expect(
        creditLine.connect(other).repay(agentId, ethers.parseEther("200"), { value: ethers.parseEther("200") })
      ).to.be.revertedWithCustomError(creditLine, "InsufficientCredit");
    });

    it("should reject zero repayment", async function () {
      const { creditLine, agent1, agentId } = await loadFixture(deployFixture);
      await creditLine.connect(agent1).requestCreditLine(agentId);

      await expect(
        creditLine.connect(agent1).repay(agentId, 0, { value: 0 })
      ).to.be.revertedWithCustomError(creditLine, "ZeroAmount");
    });
  });

  describe("View Functions", function () {
    it("should return correct remaining credit", async function () {
      const { creditLine, agent1, agentId } = await loadFixture(deployFixture);
      await creditLine.connect(agent1).requestCreditLine(agentId);
      await creditLine.connect(agent1).drawdown(agentId, ethers.parseEther("300"));

      expect(await creditLine.getRemainingCredit(agentId)).to.equal(ethers.parseEther("700"));
    });

    it("should return true when credit available", async function () {
      const { creditLine, agent1, agentId } = await loadFixture(deployFixture);
      await creditLine.connect(agent1).requestCreditLine(agentId);

      expect(await creditLine.hasRemainingCredit(agentId)).to.be.true;
    });
  });
});
