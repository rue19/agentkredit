// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "./verifiers/SuccessRateVerifier.sol";
import "./verifiers/ZeroViolationsVerifier.sol";
import "./verifiers/ActionCountVerifier.sol";

/// @title ZKBehaviorVerifier
/// @notice Domain wrapper around auto-generated Groth16 verifiers
/// @dev Routes claim types to the correct verifier, checks commitment root,
///      and prevents proof replay via nullifier tracking
contract ZKBehaviorVerifier {
    Groth16Verifier public immutable successRateVerifier;
    ZeroViolationsGroth16Verifier public immutable zeroViolationsVerifier;
    ActionCountGroth16Verifier public immutable actionCountVerifier;

    // Nullifier tracking: (agentId, nullifierHash) => spent
    // Prevents the same proof from being submitted twice
    mapping(bytes32 => mapping(bytes32 => bool)) public nullifiers;

    // Claim types
    uint8 public constant CLAIM_SUCCESS_RATE = 1;
    uint8 public constant CLAIM_ZERO_VIOLATIONS = 2;
    uint8 public constant CLAIM_ACTION_COUNT = 3;

    event BehaviorClaimVerified(
        bytes32 indexed agentId,
        uint8 claimType,
        bytes32 nullifierHash
    );

    error InvalidProof();
    error InvalidClaimType();
    error NullifierAlreadySpent();

    constructor(
        address _successRateVerifier,
        address _zeroViolationsVerifier,
        address _actionCountVerifier
    ) {
        successRateVerifier = Groth16Verifier(_successRateVerifier);
        zeroViolationsVerifier = ZeroViolationsGroth16Verifier(_zeroViolationsVerifier);
        actionCountVerifier = ActionCountGroth16Verifier(_actionCountVerifier);
    }

    /// @notice Verify a ZK behavior claim on-chain
    /// @param agentId The agent making the claim
    /// @param claimType 1=successRate, 2=zeroViolations, 3=actionCount
    /// @param pA Proof point A (G1)
    /// @param pB Proof point B (G2)
    /// @param pC Proof point C (G1)
    /// @param publicSignals Circuit public signals [commitmentRoot, threshold]
    function verifyBehaviorClaim(
        bytes32 agentId,
        uint8 claimType,
        uint256[2] calldata pA,
        uint256[2][2] calldata pB,
        uint256[2] calldata pC,
        uint256[2] calldata publicSignals
    ) external {
        // Compute nullifier from agentId + public signals to prevent replay
        bytes32 nullifierHash = keccak256(
            abi.encodePacked(agentId, publicSignals[0], publicSignals[1])
        );

        // Check nullifier not spent
        if (nullifiers[agentId][nullifierHash]) revert NullifierAlreadySpent();

        bool valid = false;

        if (claimType == CLAIM_SUCCESS_RATE) {
            valid = successRateVerifier.verifyProof(pA, pB, pC, publicSignals);
        } else if (claimType == CLAIM_ZERO_VIOLATIONS) {
            valid = zeroViolationsVerifier.verifyProof(pA, pB, pC, publicSignals);
        } else if (claimType == CLAIM_ACTION_COUNT) {
            valid = actionCountVerifier.verifyProof(pA, pB, pC, publicSignals);
        } else {
            revert InvalidClaimType();
        }

        if (!valid) revert InvalidProof();

        // Mark nullifier as spent
        nullifiers[agentId][nullifierHash] = true;

        emit BehaviorClaimVerified(agentId, claimType, nullifierHash);
    }

    /// @notice Verify a claim with ABI-encoded proof bytes (called by CreditLine)
    function verifyClaim(
        bytes32 agentId,
        uint8 claimType,
        bytes calldata proof,
        bytes32[] calldata publicInputs
    ) external returns (bool) {
        (
            uint256[2] memory pA,
            uint256[2][2] memory pB,
            uint256[2] memory pC
        ) = abi.decode(proof, (uint256[2], uint256[2][2], uint256[2]));

        uint256[2] memory signals;
        for (uint256 i = 0; i < 2; i++) {
            signals[i] = uint256(publicInputs[i]);
        }

        this.verifyBehaviorClaim(agentId, claimType, pA, pB, pC, signals);
        return true;
    }
}
