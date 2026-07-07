const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const snarkjs = require("snarkjs");
const { buildPoseidon } = require("circomlibjs");
const fs = require("fs");
const path = require("path");

describe("ZKBehaviorVerifier Integration", function () {
  this.timeout(120000); // ZK proof generation takes time

  let poseidon;
  let F;

  async function deployFixture() {
    const [owner] = await ethers.getSigners();

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

    // Deploy ZKBehaviorVerifier
    const ZKBehaviorVerifier = await ethers.getContractFactory("ZKBehaviorVerifier");
    const zkVerifier = await ZKBehaviorVerifier.deploy(
      await successRateVerifier.getAddress(),
      await zeroViolationsVerifier.getAddress(),
      await actionCountVerifier.getAddress()
    );
    await zkVerifier.waitForDeployment();

    return { zkVerifier, successRateVerifier, zeroViolationsVerifier, actionCountVerifier, owner };
  }

  // Build Poseidon hash chain
  async function buildHashChain(secret, results) {
    let state = F.toObject(poseidon([secret, 0n]));
    for (const result of results) {
      state = F.toObject(poseidon([state, BigInt(result)]));
    }
    return state;
  }

  before(async function () {
    poseidon = await buildPoseidon();
    F = poseidon.F;
  });

  describe("Success Rate Proof", function () {
    it("should verify a valid success rate proof on-chain", async function () {
      const { zkVerifier } = await loadFixture(deployFixture);

      // Create action results: 80 successes, 20 failures
      const results = new Array(80).fill(1).concat(new Array(20).fill(0));
      const secret = 12345n;
      const minSuccessCount = 70; // 70% threshold

      // Build commitment root
      const commitmentRoot = await buildHashChain(secret, results);

      // Generate ZK proof
      const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        {
          commitmentRoot: commitmentRoot.toString(),
          minSuccessCount: minSuccessCount.toString(),
          secret: secret.toString(),
          results: results.map(r => r.toString()),
        },
        path.join(__dirname, "../build/success-rate/success-rate_js/success-rate.wasm"),
        path.join(__dirname, "../build/success-rate/success-rate_final.zkey")
      );

      // Format proof for Solidity
      const pA = [proof.pi_a[0], proof.pi_a[1]];
      const pB = [
        [proof.pi_b[0][1], proof.pi_b[0][0]],
        [proof.pi_b[1][1], proof.pi_b[1][0]],
      ];
      const pC = [proof.pi_c[0], proof.pi_c[1]];

      const agentId = ethers.keccak256(ethers.toUtf8Bytes("test-agent-1"));

      // Verify on-chain
      await expect(
        zkVerifier.verifyBehaviorClaim(
          agentId,
          1, // CLAIM_SUCCESS_RATE
          pA,
          pB,
          pC,
          [commitmentRoot.toString(), minSuccessCount.toString()]
        )
      ).to.emit(zkVerifier, "BehaviorClaimVerified");
    });

    it("should reject proof with wrong commitment root", async function () {
      const { zkVerifier } = await loadFixture(deployFixture);

      const results = new Array(80).fill(1).concat(new Array(20).fill(0));
      const secret = 12345n;
      const commitmentRoot = await buildHashChain(secret, results);
      const wrongRoot = commitmentRoot + 1n;

      const { proof } = await snarkjs.groth16.fullProve(
        {
          commitmentRoot: commitmentRoot.toString(),
          minSuccessCount: "70",
          secret: secret.toString(),
          results: results.map(r => r.toString()),
        },
        path.join(__dirname, "../build/success-rate/success-rate_js/success-rate.wasm"),
        path.join(__dirname, "../build/success-rate/success-rate_final.zkey")
      );

      const pA = [proof.pi_a[0], proof.pi_a[1]];
      const pB = [
        [proof.pi_b[0][1], proof.pi_b[0][0]],
        [proof.pi_b[1][1], proof.pi_b[1][0]],
      ];
      const pC = [proof.pi_c[0], proof.pi_c[1]];

      const agentId = ethers.keccak256(ethers.toUtf8Bytes("test-agent-2"));

      // Should revert with InvalidProof (root mismatch causes verification failure)
      await expect(
        zkVerifier.verifyBehaviorClaim(
          agentId,
          1,
          pA,
          pB,
          pC,
          [wrongRoot.toString(), "70"]
        )
      ).to.be.revertedWithCustomError(zkVerifier, "InvalidProof");
    });
  });

  describe("Nullifier Replay Protection", function () {
    it("should reject the same proof submitted twice", async function () {
      const { zkVerifier } = await loadFixture(deployFixture);

      const results = new Array(10).fill(1).concat(new Array(90).fill(0));
      const secret = 99999n;
      const commitmentRoot = await buildHashChain(secret, results);

      const { proof } = await snarkjs.groth16.fullProve(
        {
          commitmentRoot: commitmentRoot.toString(),
          minSuccessCount: "5",
          secret: secret.toString(),
          results: results.map(r => r.toString()),
        },
        path.join(__dirname, "../build/success-rate/success-rate_js/success-rate.wasm"),
        path.join(__dirname, "../build/success-rate/success-rate_final.zkey")
      );

      const pA = [proof.pi_a[0], proof.pi_a[1]];
      const pB = [
        [proof.pi_b[0][1], proof.pi_b[0][0]],
        [proof.pi_b[1][1], proof.pi_b[1][0]],
      ];
      const pC = [proof.pi_c[0], proof.pi_c[1]];

      const agentId = ethers.keccak256(ethers.toUtf8Bytes("test-agent-replay"));

      // First submission should succeed
      await zkVerifier.verifyBehaviorClaim(
        agentId, 1, pA, pB, pC,
        [commitmentRoot.toString(), "5"]
      );

      // Second submission with same proof should fail (nullifier spent)
      await expect(
        zkVerifier.verifyBehaviorClaim(
          agentId, 1, pA, pB, pC,
          [commitmentRoot.toString(), "5"]
        )
      ).to.be.revertedWithCustomError(zkVerifier, "NullifierAlreadySpent");
    });
  });

  describe("Action Count Proof", function () {
    it("should verify an action count proof on-chain", async function () {
      const { zkVerifier } = await loadFixture(deployFixture);

      const actionCount = 50;
      const minActionCount = 25;
      const secret = 55555n;

      // Build chain with actionCount 1s, padded to 100 with 0s
      const results = new Array(actionCount).fill(1);
      while (results.length < 100) results.push(0);

      const commitmentRoot = await buildHashChain(secret, results);

      const { proof } = await snarkjs.groth16.fullProve(
        {
          commitmentRoot: commitmentRoot.toString(),
          minActionCount: minActionCount.toString(),
          secret: secret.toString(),
          actionCount: actionCount.toString(),
        },
        path.join(__dirname, "../build/action-count/action-count_js/action-count.wasm"),
        path.join(__dirname, "../build/action-count/action-count_final.zkey")
      );

      const pA = [proof.pi_a[0], proof.pi_a[1]];
      const pB = [
        [proof.pi_b[0][1], proof.pi_b[0][0]],
        [proof.pi_b[1][1], proof.pi_b[1][0]],
      ];
      const pC = [proof.pi_c[0], proof.pi_c[1]];

      const agentId = ethers.keccak256(ethers.toUtf8Bytes("test-agent-count"));

      await expect(
        zkVerifier.verifyBehaviorClaim(
          agentId,
          3, // CLAIM_ACTION_COUNT
          pA,
          pB,
          pC,
          [commitmentRoot.toString(), minActionCount.toString()]
        )
      ).to.emit(zkVerifier, "BehaviorClaimVerified");
    });
  });
});
