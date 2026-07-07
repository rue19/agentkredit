const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("LiquidityPool", function () {
  async function deployFixture() {
    const [owner, lp1, lp2, creditLine] = await ethers.getSigners();
    const LiquidityPool = await ethers.getContractFactory("LiquidityPool");
    const pool = await LiquidityPool.deploy();
    await pool.waitForDeployment();
    return { pool, owner, lp1, lp2, creditLine };
  }

  describe("Deployment", function () {
    it("should set deployer as owner", async function () {
      const { pool, owner } = await loadFixture(deployFixture);
      expect(await pool.owner()).to.equal(owner.address);
    });

    it("should start with zero deposits", async function () {
      const { pool } = await loadFixture(deployFixture);
      expect(await pool.totalDeposited()).to.equal(0);
    });
  });

  describe("Deposits", function () {
    it("should accept ETH deposits", async function () {
      const { pool, lp1 } = await loadFixture(deployFixture);
      const amount = ethers.parseEther("10");

      await expect(
        pool.connect(lp1).deposit({ value: amount })
      ).to.emit(pool, "LiquidityDeposited").withArgs(lp1.address, amount);

      expect(await pool.totalDeposited()).to.equal(amount);
    });

    it("should accept direct ETH transfers (receive)", async function () {
      const { pool, lp1 } = await loadFixture(deployFixture);
      const amount = ethers.parseEther("5");

      await expect(
        lp1.sendTransaction({ to: await pool.getAddress(), value: amount })
      ).to.emit(pool, "LiquidityDeposited").withArgs(lp1.address, amount);

      expect(await pool.totalDeposited()).to.equal(amount);
    });

    it("should reject zero deposits", async function () {
      const { pool, lp1 } = await loadFixture(deployFixture);
      await expect(
        pool.connect(lp1).deposit({ value: 0 })
      ).to.be.revertedWithCustomError(pool, "ZeroAmount");
    });

    it("should accumulate deposits", async function () {
      const { pool, lp1, lp2 } = await loadFixture(deployFixture);
      await pool.connect(lp1).deposit({ value: ethers.parseEther("10") });
      await pool.connect(lp2).deposit({ value: ethers.parseEther("5") });
      expect(await pool.totalDeposited()).to.equal(ethers.parseEther("15"));
    });
  });

  describe("Withdrawals", function () {
    it("should allow owner to withdraw available liquidity", async function () {
      const { pool, owner, lp1 } = await loadFixture(deployFixture);
      await pool.connect(lp1).deposit({ value: ethers.parseEther("10") });

      await expect(
        pool.connect(owner).withdraw(ethers.parseEther("5"))
      ).to.emit(pool, "LiquidityWithdrawn").withArgs(owner.address, ethers.parseEther("5"));

      expect(await pool.totalDeposited()).to.equal(ethers.parseEther("5"));
    });

    it("should reject withdrawal exceeding available liquidity", async function () {
      const { pool, owner, lp1, creditLine } = await loadFixture(deployFixture);
      await pool.connect(lp1).deposit({ value: ethers.parseEther("10") });
      await pool.setAuthorizedCaller(creditLine.address);
      await pool.connect(creditLine).provideLiquidity(ethers.parseEther("10"));

      await expect(
        pool.connect(owner).withdraw(ethers.parseEther("1"))
      ).to.be.revertedWithCustomError(pool, "InsufficientLiquidity");
    });

    it("should reject withdrawal from non-owner", async function () {
      const { pool, lp1 } = await loadFixture(deployFixture);
      await pool.connect(lp1).deposit({ value: ethers.parseEther("10") });

      await expect(
        pool.connect(lp1).withdraw(ethers.parseEther("5"))
      ).to.be.revertedWithCustomError(pool, "OwnableUnauthorizedAccount");
    });
  });

  describe("Liquidity Management", function () {
    it("should set authorized caller", async function () {
      const { pool, owner, creditLine } = await loadFixture(deployFixture);
      await expect(
        pool.connect(owner).setAuthorizedCaller(creditLine.address)
      ).to.emit(pool, "AuthorizedCallerSet").withArgs(creditLine.address);
    });

    it("should reject setting authorized caller twice", async function () {
      const { pool, owner, creditLine } = await loadFixture(deployFixture);
      await pool.connect(owner).setAuthorizedCaller(creditLine.address);
      await expect(
        pool.connect(owner).setAuthorizedCaller(creditLine.address)
      ).to.be.revertedWithCustomError(pool, "CallerAlreadySet");
    });

    it("should allow authorized caller to provide liquidity", async function () {
      const { pool, lp1, creditLine } = await loadFixture(deployFixture);
      await pool.connect(lp1).deposit({ value: ethers.parseEther("10") });
      await pool.setAuthorizedCaller(creditLine.address);

      await expect(
        pool.connect(creditLine).provideLiquidity(ethers.parseEther("5"))
      ).to.emit(pool, "LiquidityProvided").withArgs(ethers.parseEther("5"));

      expect(await pool.totalLent()).to.equal(ethers.parseEther("5"));
    });

    it("should reject liquidity provision from non-authorized caller", async function () {
      const { pool, lp1 } = await loadFixture(deployFixture);
      await pool.connect(lp1).deposit({ value: ethers.parseEther("10") });

      await expect(
        pool.connect(lp1).provideLiquidity(ethers.parseEther("5"))
      ).to.be.revertedWithCustomError(pool, "UnauthorizedCaller");
    });

    it("should allow authorized caller to retract liquidity", async function () {
      const { pool, lp1, creditLine } = await loadFixture(deployFixture);
      await pool.connect(lp1).deposit({ value: ethers.parseEther("10") });
      await pool.setAuthorizedCaller(creditLine.address);
      await pool.connect(creditLine).provideLiquidity(ethers.parseEther("5"));

      await expect(
        pool.connect(creditLine).retractLiquidity(ethers.parseEther("5"))
      ).to.emit(pool, "LiquidityRetracted").withArgs(ethers.parseEther("5"));

      expect(await pool.totalLent()).to.equal(0);
    });
  });

  describe("View Functions", function () {
    it("should return correct available liquidity", async function () {
      const { pool, lp1, creditLine } = await loadFixture(deployFixture);
      await pool.connect(lp1).deposit({ value: ethers.parseEther("10") });
      await pool.setAuthorizedCaller(creditLine.address);
      await pool.connect(creditLine).provideLiquidity(ethers.parseEther("4"));

      expect(await pool.getAvailableLiquidity()).to.equal(ethers.parseEther("6"));
    });

    it("should return correct pool utilization", async function () {
      const { pool, lp1, creditLine } = await loadFixture(deployFixture);
      await pool.connect(lp1).deposit({ value: ethers.parseEther("10") });
      await pool.setAuthorizedCaller(creditLine.address);
      await pool.connect(creditLine).provideLiquidity(ethers.parseEther("4"));

      expect(await pool.getPoolUtilization()).to.equal(4000); // 40%
    });

    it("should return zero utilization for empty pool", async function () {
      const { pool } = await loadFixture(deployFixture);
      expect(await pool.getPoolUtilization()).to.equal(0);
    });
  });
});
