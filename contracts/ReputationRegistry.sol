// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @title ReputationRegistry
/// @notice Core trust ledger — stores scores and Poseidon commitment roots
/// @dev Attestations are signed by registered attesters via EIP-712
contract ReputationRegistry is Ownable, EIP712 {
    struct ReputationData {
        int256 score; // fixed-point, can go negative
        uint256 totalActions;
        uint256 positiveActions;
        uint256 negativeActions;
        bytes32 commitmentRoot; // Poseidon root over the agent's private action log
        uint64 lastUpdate;
    }

    mapping(bytes32 => ReputationData) public reputations;

    mapping(address => bool) public isAttester;
    address[] public attesters;
    uint256 public requiredAttestations;

    // Score decay: agents with no attestations for this period lose score
    uint256 public constant DECAY_INTERVAL = 30 days;
    int256 public constant DECAY_AMOUNT = -5;

    // Tier thresholds (score ranges)
    int256 public constant TIER_1_THRESHOLD = 100;
    int256 public constant TIER_2_THRESHOLD = 500;
    int256 public constant TIER_3_THRESHOLD = 1000;

    // EIP-712 domain and type hash
    bytes32 private constant ATTESTATION_TYPEHASH =
        keccak256(
            "Attestation(bytes32 agentId,int256 scoreDelta,bytes32 newCommitmentRoot,bytes32 actionHash)"
        );

    event AttestationRecorded(
        bytes32 indexed agentId,
        int256 scoreDelta,
        bytes32 newCommitmentRoot,
        bytes32 actionHash,
        address attester
    );
    event AttesterAdded(address indexed attester);
    event AttesterRemoved(address indexed attester);
    event ScoreDecayed(bytes32 indexed agentId, int256 oldScore, int256 newScore);
    event RequiredAttestationsUpdated(uint256 oldReq, uint256 newReq);

    error AttesterNotRegistered();
    error InvalidSignature();
    error AgentNotRegistered();
    error ZeroAddress();

    constructor(
        address _initialAttester,
        uint256 _requiredAttestations
    ) Ownable(msg.sender) EIP712("AgentKredit", "1") {
        if (_initialAttester == address(0)) revert ZeroAddress();
        isAttester[_initialAttester] = true;
        attesters.push(_initialAttester);
        requiredAttestations = _requiredAttestations;

        emit AttesterAdded(_initialAttester);
    }

    /// @notice Add a new attester (owner only)
    function addAttester(address attester) external onlyOwner {
        if (attester == address(0)) revert ZeroAddress();
        if (!isAttester[attester]) {
            isAttester[attester] = true;
            attesters.push(attester);
            emit AttesterAdded(attester);
        }
    }

    /// @notice Remove an attester (owner only)
    function removeAttester(address attester) external onlyOwner {
        if (isAttester[attester]) {
            isAttester[attester] = false;
            // Remove from array
            for (uint256 i = 0; i < attesters.length; i++) {
                if (attesters[i] == attester) {
                    attesters[i] = attesters[attesters.length - 1];
                    attesters.pop();
                    break;
                }
            }
            emit AttesterRemoved(attester);
        }
    }

    /// @notice Set required number of attestation signatures
    function setRequiredAttestations(uint256 _required) external onlyOwner {
        uint256 old = requiredAttestations;
        requiredAttestations = _required;
        emit RequiredAttestationsUpdated(old, _required);
    }

    /// @notice Record an attestation with EIP-712 signature verification
    /// @param agentId The agent being attested
    /// @param scoreDelta Change to apply to agent's score (positive or negative)
    /// @param newCommitmentRoot New Poseidon root of the agent's action log
    /// @param actionHash Hash of the specific action being attested
    /// @param attesterSig EIP-712 signature from a registered attester
    function recordAttestation(
        bytes32 agentId,
        int256 scoreDelta,
        bytes32 newCommitmentRoot,
        bytes32 actionHash,
        bytes calldata attesterSig
    ) external {
        // Verify the attester signature
        address attester = _recoverAttester(agentId, scoreDelta, newCommitmentRoot, actionHash, attesterSig);
        if (!isAttester[attester]) revert AttesterNotRegistered();

        ReputationData storage rep = reputations[agentId];

        // Initialize if first attestation
        if (rep.lastUpdate == 0) {
            rep.lastUpdate = uint64(block.timestamp);
        }

        // Apply score delta
        rep.score += scoreDelta;

        // Update action counts
        rep.totalActions++;
        if (scoreDelta > 0) {
            rep.positiveActions++;
        } else if (scoreDelta < 0) {
            rep.negativeActions++;
        }

        // Update commitment root (latest root wins)
        rep.commitmentRoot = newCommitmentRoot;
        rep.lastUpdate = uint64(block.timestamp);

        emit AttestationRecorded(agentId, scoreDelta, newCommitmentRoot, actionHash, attester);
    }

    /// @notice Decay scores for inactive agents (called by keeper)
    function decayInactiveScores(bytes32[] calldata agentIds) external {
        for (uint256 i = 0; i < agentIds.length; i++) {
            ReputationData storage rep = reputations[agentIds[i]];
            if (rep.lastUpdate > 0 &&
                block.timestamp > uint256(rep.lastUpdate) + DECAY_INTERVAL &&
                rep.score > 0)
            {
                int256 oldScore = rep.score;
                rep.score += DECAY_AMOUNT;
                if (rep.score < 0) rep.score = 0;
                emit ScoreDecayed(agentIds[i], oldScore, rep.score);
            }
        }
    }

    /// @notice Get score for an agent
    function getScore(bytes32 agentId) external view returns (int256) {
        return reputations[agentId].score;
    }

    /// @notice Get tier derived from score
    /// @return 0 = no reputation, 1 = basic, 2 = established, 3 = trusted
    function getTier(bytes32 agentId) external view returns (uint8) {
        int256 score = reputations[agentId].score;
        if (score >= TIER_3_THRESHOLD) return 3;
        if (score >= TIER_2_THRESHOLD) return 2;
        if (score >= TIER_1_THRESHOLD) return 1;
        return 0;
    }

    /// @notice Get commitment root for an agent
    function getCommitmentRoot(bytes32 agentId) external view returns (bytes32) {
        return reputations[agentId].commitmentRoot;
    }

    /// @notice Get full reputation data
    function getReputation(bytes32 agentId) external view returns (ReputationData memory) {
        return reputations[agentId];
    }

    /// @notice Get all attesters
    function getAttesters() external view returns (address[] memory) {
        return attesters;
    }

    // --- Internal ---

    function _recoverAttester(
        bytes32 agentId,
        int256 scoreDelta,
        bytes32 newCommitmentRoot,
        bytes32 actionHash,
        bytes calldata sig
    ) internal view returns (address) {
        bytes32 structHash = keccak256(
            abi.encode(
                ATTESTATION_TYPEHASH,
                agentId,
                scoreDelta,
                newCommitmentRoot,
                actionHash
            )
        );
        bytes32 digest = _hashTypedDataV4(structHash);
        return ECDSA.recover(digest, sig);
    }

    function isAgentRegistered(bytes32 agentId) internal view returns (bool) {
        // Check if agentId exists in AgentRegistry by trying to read it
        // This is a soft check — the AgentRegistry must be called directly for full validation
        return reputations[agentId].lastUpdate > 0;
    }
}
