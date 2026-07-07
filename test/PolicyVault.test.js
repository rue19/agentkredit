const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("PolicyVault", function () {
  async function deployFixture() {
    const [owner, agent1, lp1, target, other] = await ethers.getSigners();

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

    await pool.setAuthorizedCaller(await creditLine.getAddress());

    const agentId = ethers.keccak256(ethers.toUtf8Bytes("agent-1"));
    await agentRegistry.connect(agent1).registerAgent(agentId, { value: ethers.parseEther("0.1") });
    await pool.connect(lp1).deposit({ value: ethers.parseEther("1000") });

    // Bootstrap reputation
    const newRoot = ethers.keccak256(ethers.toUtf8Bytes("root-1"));
    const actionHash = ethers.keccak256(ethers.toUtf8Bytes("action-1"));
    const repSig = await owner.signTypedData(
      { name: "AgentKredit", version: "1", chainId: (await ethers.provider.getNetwork()).chainId, verifyingContract: await repRegistry.getAddress() },
      { Attestation: [
        { name: "agentId", type: "bytes32" },
        { name: "scoreDelta", type: "int256" },
        { name: "newCommitmentRoot", type: "bytes32" },
        { name: "actionHash", type: "bytes32" },
      ]},
      { agentId, scoreDelta: 150, newCommitmentRoot: newRoot, actionHash }
    );
    await repRegistry.connect(owner).recordAttestation(agentId, 150, newRoot, actionHash, repSig);

    // Grant credit
    await creditLine.connect(agent1).requestCreditLine(agentId);

    // Set policy
    const selector = "0xa9059cbb"; // transfer(address,uint256)
    await vault.setPolicy(agentId, ethers.parseEther("100"), [target.address], [selector]);

    // Grant session key
    const signer = agent1;
    const sessionId = ethers.keccak256(ethers.toUtf8Bytes("session-1"));
    const maxAmount = ethers.parseEther("100");
    const expiry = Math.floor(Date.now() / 1000) + 86400;

    const skDomain = {
      name: "SessionKeyManager",
      version: "1",
      chainId: (await ethers.provider.getNetwork()).chainId,
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
      signer: signer.address,
      agentId,
      maxAmount,
      expiry,
      nonce: 0,
    });
    await skm.grantSessionKey(sessionId, signer.address, agentId, maxAmount, expiry, skSig);

    return { pool, agentRegistry, repRegistry, zkVerifier, skm, creditLine, vault, owner, agent1, lp1, target, other, agentId, sessionId, selector, skDomain };
  }

  describe("Deployment", function () {
    it("should set correct contract references", async function () {
      const { vault, skm, creditLine, pool } = await loadFixture(deployFixture);
      expect(await vault.sessionKeyManager()).to.equal(await skm.getAddress());
      expect(await vault.creditLine()).to.equal(await creditLine.getAddress());
      expect(await vault.liquidityPool()).to.equal(await pool.getAddress());
    });
  });

  describe("Policy Management", function () {
    it("should set a spending policy", async function () {
      const { vault, agentId } = await loadFixture(deployFixture);
      expect(await vault.getRemainingDailySpend(agentId)).to.equal(ethers.parseEther("100"));
    });

    it("should allow owner to update policy", async function () {
      const { vault, owner, agentId, target, selector } = await loadFixture(deployFixture);
      await vault.setPolicy(agentId, ethers.parseEther("200"), [target.address], [selector]);
      expect(await vault.getRemainingDailySpend(agentId)).to.equal(ethers.parseEther("200"));
    });

    it("should reject non-owner setting policy", async function () {
      const { vault, other, agentId, target, selector } = await loadFixture(deployFixture);
      await expect(
        vault.connect(other).setPolicy(agentId, ethers.parseEther("50"), [target.address], [selector])
      ).to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
    });
  });

  describe("Spend Execution", function () {
    it("should execute a spend with valid session key", async function () {
      const { vault, agent1, agentId, sessionId, target, selector, skm, skDomain } = await loadFixture(deployFixture);
      const amount = ethers.parseEther("10");

      const callData = ethers.concat([
        selector,
        ethers.AbiCoder.defaultAbiCoder().encode(["address", "uint256"], [target.address, amount]),
      ]);
      const callDataHash = ethers.keccak256(callData);

      const sessionSig = await agent1.signTypedData(skDomain, {
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
        vault.connect(agent1).executeSpend(
          agentId,
          sessionId,
          target.address,
          selector,
          amount,
          callData,
          sessionSig,
          0,
          "0x",
          [],
          { value: amount }
        )
      ).to.emit(vault, "SpendExecuted");
    });

    it("should reject spend with inactive session key", async function () {
      const { vault, agent1, agentId, target, selector } = await loadFixture(deployFixture);

      const fakeSessionId = ethers.keccak256(ethers.toUtf8Bytes("fake-session"));
      const fakeCallData = "0x";
      const fakeSig = "0x" + "00".repeat(65);

      await expect(
        vault.connect(agent1).executeSpend(
          agentId,
          fakeSessionId,
          target.address,
          selector,
          ethers.parseEther("10"),
          fakeCallData,
          fakeSig,
          0,
          "0x",
          []
        )
      ).to.be.revertedWithCustomError(vault, "SessionKeyInactive");
    });

    it("should reject zero amount", async function () {
      const { vault, agent1, agentId, sessionId, target, selector } = await loadFixture(deployFixture);

      await expect(
        vault.connect(agent1).executeSpend(
          agentId,
          sessionId,
          target.address,
          selector,
          0,
          "0x",
          "0x",
          0,
          "0x",
          []
        )
      ).to.be.revertedWithCustomError(vault, "InvalidAmount");
    });
  });
});
