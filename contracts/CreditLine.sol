// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

interface ILiquidityPool {
    function provideLiquidity(uint256 amount) external;
    function retractLiquidity(uint256 amount) external;
    function getAvailableLiquidity() external view returns (uint256);
}

interface IReputationRegistry {
    function getTier(bytes32 agentId) external view returns (uint256);
}

interface IZKBehaviorVerifier {
    function verifyClaim(bytes32 agentId, uint8 claimType, bytes calldata proof, bytes32[] calldata publicInputs) external returns (bool);
}

/// @title CreditLine
/// @notice On-chain credit line for AI agents backed by ZK proofs
/// @dev Agents request credit lines; drawdowns go through PolicyVault; anyone can repay
contract CreditLine is Ownable {
    enum Status { None, Active, Expired, Liquidated }

    struct Credit {
        uint256 totalCredit;    // granted amount
        uint256 drawdown;       // amount spent so far
        Status status;          // Active, Expired, Liquidated
        uint256 expiry;         // unix timestamp (30 days)
        uint256 lastProofTime;  // when last ZK proof was verified
    }

    mapping(bytes32 => Credit) public credits; // agentId => Credit

    ILiquidityPool public liquidityPool;
    IReputationRegistry public reputationRegistry;
    IZKBehaviorVerifier public zkVerifier;
    address public policyVault;

    // Tier thresholds
    mapping(uint256 => uint256) public tierLimits;
    mapping(uint256 => uint256) public tierScoreThresholds;

    // Credit expiry
    uint256 public constant CREDIT_EXPIRY = 30 days;

    // Auto-revoke threshold
    uint256 public constant AUTO_REVOKE_VIOLATIONS = 3;

    event CreditLineRequested(bytes32 indexed agentId, uint256 tier);
    event CreditLineGranted(bytes32 indexed agentId, uint256 amount);
    event CreditDrawnDown(bytes32 indexed agentId, uint256 amount, uint256 newDrawdown);
    event CreditRepaid(bytes32 indexed agentId, uint256 amount, uint256 remaining);
    event CreditExpired(bytes32 indexed agentId);
    event CreditRevoked(bytes32 indexed agentId, string reason);
    event ProofVerified(bytes32 indexed agentId, uint8 claimType, bool passed);

    error AgentNotRegistered();
    error CreditAlreadyExists();
    error CreditNotActive();
    error CreditLimitExceeded();
    error InsufficientLiquidity();
    error ZeroAmount();
    error ProofFailed();
    error InsufficientCredit();
    error OnlyPolicyVault();

    constructor(
        address _liquidityPool,
        address _reputationRegistry,
        address _zkVerifier
    ) Ownable(msg.sender) {
        liquidityPool = ILiquidityPool(_liquidityPool);
        reputationRegistry = IReputationRegistry(_reputationRegistry);
        zkVerifier = IZKBehaviorVerifier(_zkVerifier);

        // Tier limits (in wei)
        tierLimits[1] = 1000 ether;      // 1,000 BOT
        tierLimits[2] = 10000 ether;     // 10,000 BOT
        tierLimits[3] = 100000 ether;    // 100,000 BOT

        // Score thresholds
        tierScoreThresholds[1] = 100;
        tierScoreThresholds[2] = 500;
        tierScoreThresholds[3] = 1000;
    }

    /// @notice Set the authorized PolicyVault address (owner only)
    function setPolicyVault(address _policyVault) external onlyOwner {
        policyVault = _policyVault;
    }

    /// @notice Agent requests a credit line (requires reputation attestation)
    function requestCreditLine(bytes32 agentId) external {
        if (credits[agentId].status == Status.Active) revert CreditAlreadyExists();

        // Check reputation tier
        uint256 tier = reputationRegistry.getTier(agentId);
        if (tier == 0) revert AgentNotRegistered();

        // Check liquidity
        uint256 limit = tierLimits[tier];
        if (limit > liquidityPool.getAvailableLiquidity()) revert InsufficientLiquidity();

        // Lock liquidity
        liquidityPool.provideLiquidity(limit);

        // Create credit
        credits[agentId] = Credit({
            totalCredit: limit,
            drawdown: 0,
            status: Status.Active,
            expiry: block.timestamp + CREDIT_EXPIRY,
            lastProofTime: 0
        });

        emit CreditLineGranted(agentId, limit);
    }

    /// @notice Draw down credit (called by PolicyVault only)
    function drawdown(bytes32 agentId, uint256 amount) external {
        if (msg.sender != policyVault) revert OnlyPolicyVault();
        Credit storage credit = credits[agentId];
        if (credit.status != Status.Active) revert CreditNotActive();
        if (block.timestamp > credit.expiry) revert CreditNotActive();
        if (credit.drawdown + amount > credit.totalCredit) revert CreditLimitExceeded();

        credit.drawdown += amount;
        emit CreditDrawnDown(agentId, amount, credit.drawdown);
    }

    /// @notice Repay credit (anyone can repay)
    function repay(bytes32 agentId, uint256 amount) external payable {
        if (amount == 0) revert ZeroAmount();

        Credit storage credit = credits[agentId];
        if (credit.status != Status.Active) revert CreditNotActive();
        if (amount > credit.drawdown) revert InsufficientCredit();

        // Retract liquidity
        liquidityPool.retractLiquidity(amount);

        credit.drawdown -= amount;
        emit CreditRepaid(agentId, amount, credit.drawdown);
    }

    /// @notice Verify ZK behavior proof (called by PolicyVault)
    function verifyProof(
        bytes32 agentId,
        uint8 claimType,
        bytes calldata proof,
        bytes32[] calldata publicInputs
    ) external returns (bool) {
        Credit storage credit = credits[agentId];
        if (credit.status != Status.Active) revert CreditNotActive();

        bool passed = zkVerifier.verifyClaim(agentId, claimType, proof, publicInputs);
        credit.lastProofTime = block.timestamp;

        emit ProofVerified(agentId, claimType, passed);

        if (!passed) {
            credit.status = Status.Liquidated;
            emit CreditRevoked(agentId, "proof_failed");
            return false;
        }
        return true;
    }

    /// @notice Expire credit line
    function expireCreditLine(bytes32 agentId) external {
        Credit storage credit = credits[agentId];
        if (credit.status != Status.Active) revert CreditNotActive();
        if (block.timestamp <= credit.expiry) revert CreditNotActive();

        credit.status = Status.Expired;
        uint256 remaining = credit.totalCredit - credit.drawdown;
        liquidityPool.retractLiquidity(remaining);
        emit CreditExpired(agentId);
    }

    /// @notice Check if agent is within credit limit
    function hasRemainingCredit(bytes32 agentId) external view returns (bool) {
        Credit memory credit = credits[agentId];
        return credit.status == Status.Active
            && block.timestamp <= credit.expiry
            && credit.drawdown < credit.totalCredit;
    }

    /// @notice Get remaining credit
    function getRemainingCredit(bytes32 agentId) external view returns (uint256) {
        Credit memory credit = credits[agentId];
        if (credit.status != Status.Active || block.timestamp > credit.expiry) return 0;
        return credit.totalCredit - credit.drawdown;
    }
}
