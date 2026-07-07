// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/access/Ownable.sol";

/// @title AgentRegistry
/// @notice Identity anchor for every participating AI agent on AgentKredit
/// @dev agentId is a hash of the agent's public key / DID, not the operator address
contract AgentRegistry is Ownable {
    struct Agent {
        address operator; // EOA or smart account that controls the agent
        uint256 bondAmount; // staked BOT, sybil resistance
        uint64 createdAt;
        bool active;
    }

    mapping(bytes32 => Agent) public agents;

    uint256 public minBondAmount;
    uint256 public constant BOND_COOLDOWN = 7 days;

    mapping(bytes32 => uint256) public deactivationTime;

    event AgentRegistered(bytes32 indexed agentId, address indexed operator, uint256 bondAmount);
    event AgentDeactivated(bytes32 indexed agentId);
    event BondWithdrawn(bytes32 indexed agentId, uint256 amount);
    event MinBondAmountUpdated(uint256 oldAmount, uint256 newAmount);

    error AgentAlreadyRegistered();
    error AgentNotActive();
    error InsufficientBond();
    error NotOperatorOrOwner();
    error BondCooldownNotElapsed();
    error ZeroAgentId();
    error ZeroAddress();

    constructor(uint256 _minBondAmount) Ownable(msg.sender) {
        if (_minBondAmount == 0) revert InsufficientBond();
        minBondAmount = _minBondAmount;
    }

    /// @notice Register a new agent with a bond
    /// @param agentId Hash of the agent's public key / DID
    function registerAgent(bytes32 agentId) external payable {
        if (agentId == bytes32(0)) revert ZeroAgentId();
        if (agents[agentId].operator != address(0)) revert AgentAlreadyRegistered();
        if (msg.value < minBondAmount) revert InsufficientBond();

        agents[agentId] = Agent({
            operator: msg.sender,
            bondAmount: msg.value,
            createdAt: uint64(block.timestamp),
            active: true
        });

        emit AgentRegistered(agentId, msg.sender, msg.value);
    }

    /// @notice Deactivate an agent (operator or owner only)
    /// @dev Bond is locked for BOND_COOLDOWN before withdrawal
    function deactivateAgent(bytes32 agentId) external {
        Agent storage agent = agents[agentId];
        if (!agent.active) revert AgentNotActive();
        if (msg.sender != agent.operator && msg.sender != owner())
            revert NotOperatorOrOwner();

        agent.active = false;
        deactivationTime[agentId] = block.timestamp;

        emit AgentDeactivated(agentId);
    }

    /// @notice Withdraw bond after cooldown period
    function withdrawBond(bytes32 agentId) external {
        Agent storage agent = agents[agentId];
        if (agent.operator != msg.sender) revert NotOperatorOrOwner();
        if (agent.active) revert AgentNotActive();
        if (block.timestamp < deactivationTime[agentId] + BOND_COOLDOWN)
            revert BondCooldownNotElapsed();

        uint256 bond = agent.bondAmount;
        agent.bondAmount = 0;
        deactivationTime[agentId] = 0;

        (bool success, ) = msg.sender.call{value: bond}("");
        require(success, "ETH transfer failed");

        emit BondWithdrawn(agentId, bond);
    }

    /// @notice Update minimum bond amount (owner only)
    function setMinBondAmount(uint256 _newAmount) external onlyOwner {
        uint256 old = minBondAmount;
        minBondAmount = _newAmount;
        emit MinBondAmountUpdated(old, _newAmount);
    }

    /// @notice Check if an agent is registered and active
    function isAgentActive(bytes32 agentId) external view returns (bool) {
        return agents[agentId].active;
    }

    /// @notice Get agent details
    function getAgent(bytes32 agentId) external view returns (Agent memory) {
        return agents[agentId];
    }

    /// @dev Accept ETH for bond deposits
    receive() external payable {}
}
