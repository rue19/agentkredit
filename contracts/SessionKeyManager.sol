// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @title SessionKeyManager
/// @notice Minimal scoped session key delegation for AI agents
/// @dev Agent gets a key that can only call PolicyVault.executeSpend()
contract SessionKeyManager is Ownable, EIP712 {
    struct SessionKey {
        address signer;      // session key's public address
        bytes32 agentId;     // which agent this key belongs to
        uint256 maxAmount;   // max spend per transaction
        uint64 expiry;       // unix timestamp expiry
        bool active;         // revocable by owner
        uint256 nonce;       // replay protection
    }

    mapping(bytes32 => SessionKey) public sessionKeys;

    bytes32 public constant SESSION_KEY_TYPEHASH =
        keccak256("SessionKey(address signer,bytes32 agentId,uint256 maxAmount,uint256 expiry,uint256 nonce)");

    bytes32 public constant SESSION_CALL_TYPEHASH =
        keccak256("SessionCall(bytes32 sessionId,bytes32 callDataHash,uint256 nonce)");

    event SessionKeyGranted(bytes32 indexed sessionId, address signer, bytes32 agentId, uint256 expiry);
    event SessionKeyRevoked(bytes32 indexed sessionId);
    event NonceIncremented(bytes32 indexed sessionId, uint256 newNonce);

    error InvalidOwnerSignature();
    error InvalidSessionKeySignature();
    error SessionKeyExpired();
    error SessionKeyInactive();
    error SessionKeyAgentMismatch();
    error SessionKeyTargetMismatch();
    error SessionKeySelectorMismatch();
    error SessionKeyAmountExceeded();
    error ZeroAddress();

    constructor() Ownable(msg.sender) EIP712("SessionKeyManager", "1") {}

    /// @notice Owner grants a session key (with EIP-712 signature proof)
    function grantSessionKey(
        bytes32 sessionId,
        address signer,
        bytes32 agentId,
        uint256 maxAmount,
        uint256 expiry,
        bytes calldata ownerSig
    ) external {
        if (signer == address(0)) revert ZeroAddress();

        // Verify owner signed this grant
        bytes32 structHash = keccak256(
            abi.encode(SESSION_KEY_TYPEHASH, signer, agentId, maxAmount, expiry, 0)
        );
        bytes32 digest = _hashTypedDataV4(structHash);
        address recovered = ECDSA.recover(digest, ownerSig);
        if (recovered != owner()) revert InvalidOwnerSignature();

        sessionKeys[sessionId] = SessionKey({
            signer: signer,
            agentId: agentId,
            maxAmount: maxAmount,
            expiry: uint64(expiry),
            active: true,
            nonce: 0
        });

        emit SessionKeyGranted(sessionId, signer, agentId, expiry);
    }

    /// @notice Owner revokes a session key
    function revokeSessionKey(bytes32 sessionId) external onlyOwner {
        sessionKeys[sessionId].active = false;
        emit SessionKeyRevoked(sessionId);
    }

    /// @notice Increment nonce for batch revocation
    function incrementNonce(bytes32 sessionId) external onlyOwner {
        sessionKeys[sessionId].nonce++;
        emit NonceIncremented(sessionId, sessionKeys[sessionId].nonce);
    }

    /// @notice Validate a session key for a specific call
    function validateSessionKey(
        bytes32 sessionId,
        bytes32 agentId,
        address target,
        bytes4 selector,
        uint256 amount,
        bytes calldata signature
    ) external view returns (bool) {
        SessionKey memory session = sessionKeys[sessionId];

        if (!session.active) return false;
        if (block.timestamp > session.expiry) return false;
        if (session.agentId != agentId) return false;
        if (amount > session.maxAmount) return false;

        // Build the call data hash that was signed
        bytes memory callData = abi.encodeWithSelector(selector, target, amount);
        bytes32 callDataHash = keccak256(callData);

        // Verify EIP-712 signature from session signer
        bytes32 structHash = keccak256(
            abi.encode(SESSION_CALL_TYPEHASH, sessionId, callDataHash, session.nonce)
        );
        bytes32 digest = _hashTypedDataV4(structHash);
        address recovered = ECDSA.recover(digest, signature);

        return recovered == session.signer;
    }

    /// @notice Check if a session is active and not expired
    function isActiveSession(bytes32 sessionId) external view returns (bool) {
        SessionKey memory session = sessionKeys[sessionId];
        return session.active && block.timestamp <= session.expiry;
    }
}
