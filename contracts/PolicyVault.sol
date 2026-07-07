// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/access/Ownable.sol";

interface ISessionKeyManager {
    function isActiveSession(bytes32 sessionId) external view returns (bool);
    function validateSessionKey(
        bytes32 sessionId,
        bytes32 agentId,
        address target,
        bytes4 selector,
        uint256 amount,
        bytes calldata signature
    ) external view returns (bool);
    function sessionKeys(bytes32 sessionId) external view returns (
        address signer,
        bytes32 agentId,
        uint256 maxAmount,
        uint64 expiry,
        bool active,
        uint256 nonce
    );
}

interface ICreditLine {
    function verifyProof(
        bytes32 agentId,
        uint8 claimType,
        bytes calldata proof,
        bytes32[] calldata publicInputs
    ) external returns (bool);
    function drawdown(bytes32 agentId, uint256 amount) external;
    function hasRemainingCredit(bytes32 agentId) external view returns (bool);
    function getRemainingCredit(bytes32 agentId) external view returns (uint256);
}

interface ILiquidityPool {
    function getAvailableLiquidity() external view returns (uint256);
}

/// @title PolicyVault
/// @notice Enforces spending policies for AI agents via session keys + ZK proofs
/// @dev All spend operations route through here
contract PolicyVault is Ownable {
    struct SpendPolicy {
        uint256 dailyLimit;    // max spend per day (UTC midnight reset)
        uint256 dailyUsed;     // amount spent today
        uint256 lastResetDay;  // last reset day (block.timestamp / 1 days)
        address[] allowedTargets; // allowed contract addresses
        bytes4[] allowedSelectors; // allowed function selectors
    }

    mapping(bytes32 => SpendPolicy) public policies; // agentId => policy

    ISessionKeyManager public sessionKeyManager;
    ICreditLine public creditLine;
    ILiquidityPool public liquidityPool;

    event SpendExecuted(
        bytes32 indexed agentId,
        bytes32 indexed sessionId,
        address target,
        bytes4 selector,
        uint256 amount
    );
    event PolicySet(
        bytes32 indexed agentId,
        uint256 dailyLimit,
        uint256 allowedTargetsCount
    );
    event ProofSubmitted(bytes32 indexed agentId, uint8 claimType, bool passed);

    error UnauthorizedSessionKey();
    error SessionKeyInactive();
    error TargetNotAllowed();
    error SelectorNotAllowed();
    error DailyLimitExceeded();
    error NoRemainingCredit();
    error InvalidAmount();
    error PolicyNotSet();

    constructor(
        address _sessionKeyManager,
        address _creditLine,
        address _liquidityPool
    ) Ownable(msg.sender) {
        sessionKeyManager = ISessionKeyManager(_sessionKeyManager);
        creditLine = ICreditLine(_creditLine);
        liquidityPool = ILiquidityPool(_liquidityPool);
    }

    /// @notice Set spending policy for an agent
    function setPolicy(
        bytes32 agentId,
        uint256 dailyLimit,
        address[] calldata allowedTargets,
        bytes4[] calldata allowedSelectors
    ) external onlyOwner {
        policies[agentId] = SpendPolicy({
            dailyLimit: dailyLimit,
            dailyUsed: 0,
            lastResetDay: 0,
            allowedTargets: allowedTargets,
            allowedSelectors: allowedSelectors
        });
        emit PolicySet(agentId, dailyLimit, allowedTargets.length);
    }

    /// @notice Execute a spend with session key validation + policy enforcement
    function executeSpend(
        bytes32 agentId,
        bytes32 sessionId,
        address target,
        bytes4 selector,
        uint256 amount,
        bytes calldata callData,
        bytes calldata sessionKeySig,
        uint8 claimType,
        bytes calldata proof,
        bytes32[] calldata publicInputs
    ) external payable {
        if (amount == 0) revert InvalidAmount();

        // 1. Validate session key
        if (!sessionKeyManager.isActiveSession(sessionId)) revert SessionKeyInactive();

        // 2. Verify session key signature
        bool valid = sessionKeyManager.validateSessionKey(
            sessionId,
            agentId,
            target,
            selector,
            amount,
            sessionKeySig
        );
        if (!valid) revert UnauthorizedSessionKey();

        // 3. Check target and selector are allowed
        SpendPolicy storage policy = policies[agentId];
        if (policy.dailyLimit == 0) revert PolicyNotSet();

        bool targetAllowed = false;
        for (uint256 i = 0; i < policy.allowedTargets.length; i++) {
            if (policy.allowedTargets[i] == target) {
                targetAllowed = true;
                break;
            }
        }
        if (!targetAllowed) revert TargetNotAllowed();

        bool selectorAllowed = false;
        for (uint256 i = 0; i < policy.allowedSelectors.length; i++) {
            if (policy.allowedSelectors[i] == selector) {
                selectorAllowed = true;
                break;
            }
        }
        if (!selectorAllowed) revert SelectorNotAllowed();

        // 4. Check daily limit
        uint256 currentDay = block.timestamp / 1 days;
        if (currentDay > policy.lastResetDay) {
            policy.dailyUsed = 0;
            policy.lastResetDay = currentDay;
        }
        if (policy.dailyUsed + amount > policy.dailyLimit) revert DailyLimitExceeded();

        // 5. Verify ZK behavior proof
        if (proof.length > 0) {
            bool passed = creditLine.verifyProof(agentId, claimType, proof, publicInputs);
            emit ProofSubmitted(agentId, claimType, passed);
            if (!passed) revert PolicyNotSet();
        }

        // 6. Check credit line has capacity
        if (!creditLine.hasRemainingCredit(agentId)) revert NoRemainingCredit();

        // 7. Drawdown from credit line
        creditLine.drawdown(agentId, amount);

        // 8. Update daily usage
        policy.dailyUsed += amount;

        // 9. Forward ETH to target
        (bool success, ) = target.call{value: amount}(callData);
        require(success, "Target call failed");

        emit SpendExecuted(agentId, sessionId, target, selector, amount);
    }

    /// @notice Get remaining daily spend
    function getRemainingDailySpend(bytes32 agentId) external view returns (uint256) {
        SpendPolicy memory policy = policies[agentId];
        uint256 currentDay = block.timestamp / 1 days;
        uint256 used = (currentDay > policy.lastResetDay) ? 0 : policy.dailyUsed;
        return policy.dailyLimit - used;
    }
}
