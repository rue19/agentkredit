const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("SessionKeyManager", function () {
  async function deployFixture() {
    const [owner, agent, signer, other] = await ethers.getSigners();
    const SessionKeyManager = await ethers.getContractFactory("SessionKeyManager");
    const skm = await SessionKeyManager.deploy();
    await skm.waitForDeployment();

    const agentId = ethers.keccak256(ethers.toUtf8Bytes("agent-1"));
    const sessionId = ethers.keccak256(ethers.toUtf8Bytes("session-1"));

    return { skm, owner, agent, signer, other, agentId, sessionId };
  }

  async function getDomain(skm) {
    return {
      name: "SessionKeyManager",
      version: "1",
      chainId: (await ethers.provider.getNetwork()).chainId,
      verifyingContract: await skm.getAddress(),
    };
  }

  const SessionKeyType = {
    SessionKey: [
      { name: "signer", type: "address" },
      { name: "agentId", type: "bytes32" },
      { name: "maxAmount", type: "uint256" },
      { name: "expiry", type: "uint256" },
      { name: "nonce", type: "uint256" },
    ],
  };

  const SessionCallType = {
    SessionCall: [
      { name: "sessionId", type: "bytes32" },
      { name: "callDataHash", type: "bytes32" },
      { name: "nonce", type: "uint256" },
    ],
  };

  async function grantDefaultSession(skm, owner, signer, agentId, sessionId) {
    const maxAmount = ethers.parseEther("100");
    const expiry = Math.floor(Date.now() / 1000) + 86400;
    const domain = await getDomain(skm);
    const sig = await owner.signTypedData(domain, SessionKeyType, {
      signer: signer.address,
      agentId,
      maxAmount,
      expiry,
      nonce: 0,
    });
    await skm.grantSessionKey(sessionId, signer.address, agentId, maxAmount, expiry, sig);
    return { maxAmount, expiry };
  }

  describe("Deployment", function () {
    it("should set deployer as owner", async function () {
      const { skm, owner } = await loadFixture(deployFixture);
      expect(await skm.owner()).to.equal(owner.address);
    });
  });

  describe("Session Key Granting", function () {
    it("should grant a session key with valid owner signature", async function () {
      const { skm, owner, signer, agentId, sessionId } = await loadFixture(deployFixture);
      const maxAmount = ethers.parseEther("100");
      const expiry = Math.floor(Date.now() / 1000) + 86400;
      const domain = await getDomain(skm);

      const sig = await owner.signTypedData(domain, SessionKeyType, {
        signer: signer.address,
        agentId,
        maxAmount,
        expiry,
        nonce: 0,
      });

      await expect(
        skm.grantSessionKey(sessionId, signer.address, agentId, maxAmount, expiry, sig)
      ).to.emit(skm, "SessionKeyGranted");

      const session = await skm.sessionKeys(sessionId);
      expect(session.signer).to.equal(signer.address);
      expect(session.agentId).to.equal(agentId);
      expect(session.maxAmount).to.equal(maxAmount);
      expect(session.active).to.be.true;
    });

    it("should reject granting with invalid owner signature", async function () {
      const { skm, other, signer, agentId, sessionId } = await loadFixture(deployFixture);
      const maxAmount = ethers.parseEther("100");
      const expiry = Math.floor(Date.now() / 1000) + 86400;
      const domain = await getDomain(skm);

      const sig = await other.signTypedData(domain, SessionKeyType, {
        signer: signer.address,
        agentId,
        maxAmount,
        expiry,
        nonce: 0,
      });

      await expect(
        skm.grantSessionKey(sessionId, signer.address, agentId, maxAmount, expiry, sig)
      ).to.be.revertedWithCustomError(skm, "InvalidOwnerSignature");
    });

    it("should reject granting with zero signer address", async function () {
      const { skm, owner, agentId, sessionId } = await loadFixture(deployFixture);
      const maxAmount = ethers.parseEther("100");
      const expiry = Math.floor(Date.now() / 1000) + 86400;
      const domain = await getDomain(skm);

      const sig = await owner.signTypedData(domain, SessionKeyType, {
        signer: ethers.ZeroAddress,
        agentId,
        maxAmount,
        expiry,
        nonce: 0,
      });

      await expect(
        skm.grantSessionKey(sessionId, ethers.ZeroAddress, agentId, maxAmount, expiry, sig)
      ).to.be.revertedWithCustomError(skm, "ZeroAddress");
    });
  });

  describe("Session Key Revocation", function () {
    it("should allow owner to revoke a session key", async function () {
      const { skm, owner, signer, agentId, sessionId } = await loadFixture(deployFixture);
      await grantDefaultSession(skm, owner, signer, agentId, sessionId);

      await expect(
        skm.revokeSessionKey(sessionId)
      ).to.emit(skm, "SessionKeyRevoked");

      const session = await skm.sessionKeys(sessionId);
      expect(session.active).to.be.false;
    });
  });

  describe("Session Validation", function () {
    it("should return true for valid session key", async function () {
      const { skm, owner, signer, agentId, sessionId } = await loadFixture(deployFixture);
      await grantDefaultSession(skm, owner, signer, agentId, sessionId);
      expect(await skm.isActiveSession(sessionId)).to.be.true;
    });

    it("should return false for revoked session", async function () {
      const { skm, owner, signer, agentId, sessionId } = await loadFixture(deployFixture);
      await grantDefaultSession(skm, owner, signer, agentId, sessionId);
      await skm.revokeSessionKey(sessionId);
      expect(await skm.isActiveSession(sessionId)).to.be.false;
    });

    it("should return false for expired session", async function () {
      const { skm, owner, signer, agentId, sessionId } = await loadFixture(deployFixture);
      const maxAmount = ethers.parseEther("100");
      const expiry = Math.floor(Date.now() / 1000) - 1;
      const domain = await getDomain(skm);

      const sig = await owner.signTypedData(domain, SessionKeyType, {
        signer: signer.address,
        agentId,
        maxAmount,
        expiry,
        nonce: 0,
      });
      await skm.grantSessionKey(sessionId, signer.address, agentId, maxAmount, expiry, sig);
      expect(await skm.isActiveSession(sessionId)).to.be.false;
    });
  });

  describe("Nonce Management", function () {
    it("should allow owner to increment nonce", async function () {
      const { skm, owner, signer, agentId, sessionId } = await loadFixture(deployFixture);
      await grantDefaultSession(skm, owner, signer, agentId, sessionId);

      await expect(skm.incrementNonce(sessionId))
        .to.emit(skm, "NonceIncremented");
      const session = await skm.sessionKeys(sessionId);
      expect(session.nonce).to.equal(1);
    });
  });
});
