const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("Attestation Oracle Integration", function () {
  async function deployFixture() {
    const [owner, attester1] = await ethers.getSigners();

    // Deploy ReputationRegistry with attester1 as initial attester
    const ReputationRegistry = await ethers.getContractFactory("ReputationRegistry");
    const registry = await ReputationRegistry.deploy(attester1.address, 1);
    await registry.waitForDeployment();

    return { registry, owner, attester1 };
  }

  function computeActionHash(agentId, actionType, timestamp) {
    return ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["bytes32", "string", "uint256", "bytes"],
        [agentId, actionType, timestamp, "0x"]
      )
    );
  }

  function computeCommitmentRoot(actions) {
    let root = ethers.ZeroHash;
    for (const action of actions) {
      root = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ["bytes32", "bytes32"],
          [root, action]
        )
      );
    }
    return root;
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

  describe("EIP-712 Signature Verification", function () {
    it("should accept valid attestation from registered attester", async function () {
      const { registry, attester1 } = await loadFixture(deployFixture);
      const agentId = ethers.keccak256(ethers.toUtf8Bytes("agent-oracle-test"));
      const timestamp = Math.floor(Date.now() / 1000);

      // Simulate oracle workflow
      const actionHash = computeActionHash(agentId, "TASK_COMPLETED", timestamp);
      const commitmentRoot = computeCommitmentRoot([actionHash]);
      const scoreDelta = 10;

      // Sign with the attester wallet (simulating oracle signing)
      const sig = await signAttestation(attester1, registry, agentId, scoreDelta, commitmentRoot, actionHash);

      // Submit — should succeed
      await expect(
        registry.connect(attester1).recordAttestation(agentId, scoreDelta, commitmentRoot, actionHash, sig)
      ).to.emit(registry, "AttestationRecorded");

      const rep = await registry.getReputation(agentId);
      expect(rep.score).to.equal(scoreDelta);
      expect(rep.commitmentRoot).to.equal(commitmentRoot);
    });

    it("should reject signature from non-registered attester", async function () {
      const [,, nonAttester] = await ethers.getSigners();
      const { registry } = await loadFixture(deployFixture);
      const agentId = ethers.keccak256(ethers.toUtf8Bytes("agent-oracle-test"));
      const timestamp = Math.floor(Date.now() / 1000);

      const actionHash = computeActionHash(agentId, "TASK_COMPLETED", timestamp);
      const commitmentRoot = computeCommitmentRoot([actionHash]);

      // Sign with non-registered wallet
      const sig = await signAttestation(nonAttester, registry, agentId, 10, commitmentRoot, actionHash);

      await expect(
        registry.connect(nonAttester).recordAttestation(agentId, 10, commitmentRoot, actionHash, sig)
      ).to.be.revertedWithCustomError(registry, "AttesterNotRegistered");
    });

    it("should handle sequential attestations (simulating oracle loop)", async function () {
      const { registry, attester1 } = await loadFixture(deployFixture);
      const agentId = ethers.keccak256(ethers.toUtf8Bytes("agent-seq-test"));

      const actionHashes = [];
      let currentRoot = ethers.ZeroHash;

      // Simulate 5 sequential attestations
      for (let i = 0; i < 5; i++) {
        const timestamp = Math.floor(Date.now() / 1000) + i;
        const actionHash = computeActionHash(agentId, "TASK_COMPLETED", timestamp);
        actionHashes.push(actionHash);

        // Build new commitment root (hash chain)
        currentRoot = computeCommitmentRoot(actionHashes);

        const scoreDelta = 5;
        const sig = await signAttestation(attester1, registry, agentId, scoreDelta, currentRoot, actionHash);

        await registry.connect(attester1).recordAttestation(agentId, scoreDelta, currentRoot, actionHash, sig);
      }

      const rep = await registry.getReputation(agentId);
      expect(rep.score).to.equal(25); // 5 * 5
      expect(rep.totalActions).to.equal(5);
      expect(rep.positiveActions).to.equal(5);
      expect(rep.commitmentRoot).to.equal(currentRoot);
    });
  });

  describe("Score Delta Computation", function () {
    it("should apply correct deltas for different event types", async function () {
      const { registry, attester1 } = await loadFixture(deployFixture);
      const agentId = ethers.keccak256(ethers.toUtf8Bytes("agent-delta-test"));
      const root = ethers.ZeroHash;

      // Positive: TASK_COMPLETED (+10)
      const hash1 = computeActionHash(agentId, "TASK_COMPLETED", 1);
      const sig1 = await signAttestation(attester1, registry, agentId, 10, root, hash1);
      await registry.connect(attester1).recordAttestation(agentId, 10, root, hash1, sig1);

      // Negative: POLICY_VIOLATION (-10)
      const hash2 = computeActionHash(agentId, "POLICY_VIOLATION", 2);
      const sig2 = await signAttestation(attester1, registry, agentId, -10, root, hash2);
      await registry.connect(attester1).recordAttestation(agentId, -10, root, hash2, sig2);

      const rep = await registry.getReputation(agentId);
      expect(rep.score).to.equal(0); // 10 - 10
      expect(rep.positiveActions).to.equal(1);
      expect(rep.negativeActions).to.equal(1);
    });
  });
});
