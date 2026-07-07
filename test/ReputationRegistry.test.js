const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("ReputationRegistry", function () {
  async function deployFixture() {
    const [owner, attester1, attester2, nonAttester] = await ethers.getSigners();

    const ReputationRegistry = await ethers.getContractFactory("ReputationRegistry");
    const registry = await ReputationRegistry.deploy(attester1.address, 1);
    await registry.waitForDeployment();

    return { registry, owner, attester1, attester2, nonAttester };
  }

  async function signAttestation(wallet, contract, agentId, scoreDelta, newRoot, actionHash) {
    const chainId = (await ethers.provider.getNetwork()).chainId;
    return wallet.signTypedData(
      { name: "AgentKredit", version: "1", chainId, verifyingContract: await contract.getAddress() },
      { Attestation: [
        { name: "agentId", type: "bytes32" },
        { name: "scoreDelta", type: "int256" },
        { name: "newCommitmentRoot", type: "bytes32" },
        { name: "actionHash", type: "bytes32" },
      ]},
      { agentId, scoreDelta, newCommitmentRoot: newRoot, actionHash }
    );
  }

  describe("Deployment", function () {
    it("should set the initial attester", async function () {
      const { registry, attester1 } = await loadFixture(deployFixture);
      expect(await registry.isAttester(attester1.address)).to.be.true;
    });

    it("should set required attestations to 1", async function () {
      const { registry } = await loadFixture(deployFixture);
      expect(await registry.requiredAttestations()).to.equal(1);
    });
  });

  describe("Attester Management", function () {
    it("should add a new attester", async function () {
      const { registry, owner, attester2 } = await loadFixture(deployFixture);
      await expect(
        registry.connect(owner).addAttester(attester2.address)
      ).to.emit(registry, "AttesterAdded").withArgs(attester2.address);
      expect(await registry.isAttester(attester2.address)).to.be.true;
    });

    it("should remove an attester", async function () {
      const { registry, owner, attester1 } = await loadFixture(deployFixture);
      await expect(
        registry.connect(owner).removeAttester(attester1.address)
      ).to.emit(registry, "AttesterRemoved").withArgs(attester1.address);
      expect(await registry.isAttester(attester1.address)).to.be.false;
    });

    it("should reject non-owner adding attester", async function () {
      const { registry, attester2 } = await loadFixture(deployFixture);
      await expect(
        registry.connect(attester2).addAttester(attester2.address)
      ).to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount");
    });
  });

  describe("Attestation Recording", function () {
    it("should record a valid attestation", async function () {
      const { registry, attester1 } = await loadFixture(deployFixture);
      const agentId = ethers.keccak256(ethers.toUtf8Bytes("agent-1"));
      const scoreDelta = 10;
      const newRoot = ethers.keccak256(ethers.toUtf8Bytes("root-1"));
      const actionHash = ethers.keccak256(ethers.toUtf8Bytes("action-1"));

      const sig = await signAttestation(attester1, registry, agentId, scoreDelta, newRoot, actionHash);

      await expect(
        registry.connect(attester1).recordAttestation(agentId, scoreDelta, newRoot, actionHash, sig)
      ).to.emit(registry, "AttestationRecorded");

      const rep = await registry.getReputation(agentId);
      expect(rep.score).to.equal(scoreDelta);
      expect(rep.commitmentRoot).to.equal(newRoot);
      expect(rep.totalActions).to.equal(1);
      expect(rep.positiveActions).to.equal(1);
    });

    it("should reject attestation from non-attester", async function () {
      const { registry, nonAttester } = await loadFixture(deployFixture);
      const agentId = ethers.keccak256(ethers.toUtf8Bytes("agent-1"));
      const scoreDelta = 10;
      const newRoot = ethers.keccak256(ethers.toUtf8Bytes("root-1"));
      const actionHash = ethers.keccak256(ethers.toUtf8Bytes("action-1"));

      const sig = await signAttestation(nonAttester, registry, agentId, scoreDelta, newRoot, actionHash);

      await expect(
        registry.connect(nonAttester).recordAttestation(agentId, scoreDelta, newRoot, actionHash, sig)
      ).to.be.revertedWithCustomError(registry, "AttesterNotRegistered");
    });

    it("should accumulate multiple attestations", async function () {
      const { registry, attester1 } = await loadFixture(deployFixture);
      const agentId = ethers.keccak256(ethers.toUtf8Bytes("agent-1"));
      const newRoot = ethers.keccak256(ethers.toUtf8Bytes("root-1"));

      // Attestation 1: +10
      const actionHash1 = ethers.keccak256(ethers.toUtf8Bytes("action-1"));
      const sig1 = await signAttestation(attester1, registry, agentId, 10, newRoot, actionHash1);
      await registry.connect(attester1).recordAttestation(agentId, 10, newRoot, actionHash1, sig1);

      // Attestation 2: +15
      const actionHash2 = ethers.keccak256(ethers.toUtf8Bytes("action-2"));
      const sig2 = await signAttestation(attester1, registry, agentId, 15, newRoot, actionHash2);
      await registry.connect(attester1).recordAttestation(agentId, 15, newRoot, actionHash2, sig2);

      const rep = await registry.getReputation(agentId);
      expect(rep.score).to.equal(25);
      expect(rep.totalActions).to.equal(2);
    });
  });

  describe("Score Decay", function () {
    it("should decay score for inactive agents", async function () {
      const { registry, attester1 } = await loadFixture(deployFixture);
      const agentId = ethers.keccak256(ethers.toUtf8Bytes("agent-1"));
      const newRoot = ethers.keccak256(ethers.toUtf8Bytes("root-1"));
      const actionHash = ethers.keccak256(ethers.toUtf8Bytes("action-1"));

      // Register and attest
      const sig = await signAttestation(attester1, registry, agentId, 50, newRoot, actionHash);
      await registry.connect(attester1).recordAttestation(agentId, 50, newRoot, actionHash, sig);

      // Advance time past decay interval
      await ethers.provider.send("evm_increaseTime", [31 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine", []);

      await expect(
        registry.decayInactiveScores([agentId])
      ).to.emit(registry, "ScoreDecayed");

      const score = await registry.getScore(agentId);
      expect(score).to.equal(45); // 50 - 5
    });
  });

  describe("Tier Derivation", function () {
    it("should return correct tiers based on score", async function () {
      const { registry, attester1 } = await loadFixture(deployFixture);
      const agentId = ethers.keccak256(ethers.toUtf8Bytes("agent-1"));
      const newRoot = ethers.keccak256(ethers.toUtf8Bytes("root-1"));

      // Tier 0 (no reputation)
      expect(await registry.getTier(agentId)).to.equal(0);

      // Tier 1 (score >= 100)
      const actionHash1 = ethers.keccak256(ethers.toUtf8Bytes("action-1"));
      const sig1 = await signAttestation(attester1, registry, agentId, 100, newRoot, actionHash1);
      await registry.connect(attester1).recordAttestation(agentId, 100, newRoot, actionHash1, sig1);
      expect(await registry.getTier(agentId)).to.equal(1);

      // Tier 2 (score >= 500)
      const actionHash2 = ethers.keccak256(ethers.toUtf8Bytes("action-2"));
      const sig2 = await signAttestation(attester1, registry, agentId, 400, newRoot, actionHash2);
      await registry.connect(attester1).recordAttestation(agentId, 400, newRoot, actionHash2, sig2);
      expect(await registry.getTier(agentId)).to.equal(2);

      // Tier 3 (score >= 1000)
      const actionHash3 = ethers.keccak256(ethers.toUtf8Bytes("action-3"));
      const sig3 = await signAttestation(attester1, registry, agentId, 500, newRoot, actionHash3);
      await registry.connect(attester1).recordAttestation(agentId, 500, newRoot, actionHash3, sig3);
      expect(await registry.getTier(agentId)).to.equal(3);
    });
  });
});
