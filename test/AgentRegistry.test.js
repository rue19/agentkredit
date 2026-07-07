const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("AgentRegistry", function () {
  const MIN_BOND = ethers.parseEther("0.1");

  async function deployFixture() {
    const [owner, operator1, operator2] = await ethers.getSigners();
    const AgentRegistry = await ethers.getContractFactory("AgentRegistry");
    const registry = await AgentRegistry.deploy(MIN_BOND);
    await registry.waitForDeployment();
    return { registry, owner, operator1, operator2 };
  }

  describe("Deployment", function () {
    it("should set the correct minimum bond amount", async function () {
      const { registry } = await loadFixture(deployFixture);
      expect(await registry.minBondAmount()).to.equal(MIN_BOND);
    });

    it("should set the deployer as owner", async function () {
      const { registry, owner } = await loadFixture(deployFixture);
      expect(await registry.owner()).to.equal(owner.address);
    });
  });

  describe("Agent Registration", function () {
    it("should register an agent with sufficient bond", async function () {
      const { registry, operator1 } = await loadFixture(deployFixture);
      const agentId = ethers.keccak256(ethers.toUtf8Bytes("agent-1"));

      await expect(
        registry.connect(operator1).registerAgent(agentId, { value: MIN_BOND })
      ).to.emit(registry, "AgentRegistered").withArgs(agentId, operator1.address, MIN_BOND);

      const agent = await registry.getAgent(agentId);
      expect(agent.operator).to.equal(operator1.address);
      expect(agent.bondAmount).to.equal(MIN_BOND);
      expect(agent.active).to.be.true;
    });

    it("should reject registration with insufficient bond", async function () {
      const { registry, operator1 } = await loadFixture(deployFixture);
      const agentId = ethers.keccak256(ethers.toUtf8Bytes("agent-1"));
      const insufficientBond = ethers.parseEther("0.01");

      await expect(
        registry.connect(operator1).registerAgent(agentId, { value: insufficientBond })
      ).to.be.revertedWithCustomError(registry, "InsufficientBond");
    });

    it("should reject duplicate registration", async function () {
      const { registry, operator1 } = await loadFixture(deployFixture);
      const agentId = ethers.keccak256(ethers.toUtf8Bytes("agent-1"));

      await registry.connect(operator1).registerAgent(agentId, { value: MIN_BOND });
      await expect(
        registry.connect(operator1).registerAgent(agentId, { value: MIN_BOND })
      ).to.be.revertedWithCustomError(registry, "AgentAlreadyRegistered");
    });

    it("should reject zero agentId", async function () {
      const { registry, operator1 } = await loadFixture(deployFixture);
      await expect(
        registry.connect(operator1).registerAgent(ethers.ZeroHash, { value: MIN_BOND })
      ).to.be.revertedWithCustomError(registry, "ZeroAgentId");
    });
  });

  describe("Agent Deactivation", function () {
    it("should allow operator to deactivate their agent", async function () {
      const { registry, operator1 } = await loadFixture(deployFixture);
      const agentId = ethers.keccak256(ethers.toUtf8Bytes("agent-1"));

      await registry.connect(operator1).registerAgent(agentId, { value: MIN_BOND });
      await expect(
        registry.connect(operator1).deactivateAgent(agentId)
      ).to.emit(registry, "AgentDeactivated").withArgs(agentId);

      const agent = await registry.getAgent(agentId);
      expect(agent.active).to.be.false;
    });

    it("should allow owner to deactivate any agent", async function () {
      const { registry, owner, operator1 } = await loadFixture(deployFixture);
      const agentId = ethers.keccak256(ethers.toUtf8Bytes("agent-1"));

      await registry.connect(operator1).registerAgent(agentId, { value: MIN_BOND });
      await expect(
        registry.connect(owner).deactivateAgent(agentId)
      ).to.emit(registry, "AgentDeactivated").withArgs(agentId);
    });

    it("should reject deactivation by non-operator non-owner", async function () {
      const { registry, operator1, operator2 } = await loadFixture(deployFixture);
      const agentId = ethers.keccak256(ethers.toUtf8Bytes("agent-1"));

      await registry.connect(operator1).registerAgent(agentId, { value: MIN_BOND });
      await expect(
        registry.connect(operator2).deactivateAgent(agentId)
      ).to.be.revertedWithCustomError(registry, "NotOperatorOrOwner");
    });
  });

  describe("Bond Withdrawal", function () {
    it("should allow bond withdrawal after cooldown", async function () {
      const { registry, operator1 } = await loadFixture(deployFixture);
      const agentId = ethers.keccak256(ethers.toUtf8Bytes("agent-1"));

      await registry.connect(operator1).registerAgent(agentId, { value: MIN_BOND });
      await registry.connect(operator1).deactivateAgent(agentId);

      // Try before cooldown — should fail
      await expect(
        registry.connect(operator1).withdrawBond(agentId)
      ).to.be.revertedWithCustomError(registry, "BondCooldownNotElapsed");

      // Advance time past cooldown
      await ethers.provider.send("evm_increaseTime", [7 * 24 * 60 * 60 + 1]);
      await ethers.provider.send("evm_mine", []);

      const balanceBefore = await ethers.provider.getBalance(operator1.address);
      const tx = await registry.connect(operator1).withdrawBond(agentId);
      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed * receipt.gasPrice;
      const balanceAfter = await ethers.provider.getBalance(operator1.address);

      expect(balanceAfter + gasUsed - balanceBefore).to.equal(MIN_BOND);
    });
  });

  describe("isAgentActive", function () {
    it("should return true for active agents", async function () {
      const { registry, operator1 } = await loadFixture(deployFixture);
      const agentId = ethers.keccak256(ethers.toUtf8Bytes("agent-1"));

      await registry.connect(operator1).registerAgent(agentId, { value: MIN_BOND });
      expect(await registry.isAgentActive(agentId)).to.be.true;
    });

    it("should return false for inactive agents", async function () {
      const { registry, operator1 } = await loadFixture(deployFixture);
      const agentId = ethers.keccak256(ethers.toUtf8Bytes("agent-1"));

      expect(await registry.isAgentActive(agentId)).to.be.false;
    });
  });
});
