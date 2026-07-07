// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/access/Ownable.sol";

/// @title LiquidityPool
/// @notice Holds BOT deposited by liquidity providers, backs credit lines
/// @dev Only the authorized CreditLine contract can provide/retract liquidity
contract LiquidityPool is Ownable {
    uint256 public totalDeposited;
    uint256 public totalLent;

    address public authorizedCaller; // CreditLine address

    event LiquidityDeposited(address indexed lp, uint256 amount);
    event LiquidityWithdrawn(address indexed lp, uint256 amount);
    event LiquidityProvided(uint256 amount);
    event LiquidityRetracted(uint256 amount);
    event AuthorizedCallerSet(address caller);

    error InsufficientLiquidity();
    error UnauthorizedCaller();
    error CallerAlreadySet();
    error ZeroAmount();

    constructor() Ownable(msg.sender) {}

    /// @notice Set the authorized caller (CreditLine) — one-time only
    function setAuthorizedCaller(address _caller) external onlyOwner {
        if (authorizedCaller != address(0)) revert CallerAlreadySet();
        authorizedCaller = _caller;
        emit AuthorizedCallerSet(_caller);
    }

    /// @notice Deposit BOT into the pool
    function deposit() external payable {
        if (msg.value == 0) revert ZeroAmount();
        totalDeposited += msg.value;
        emit LiquidityDeposited(msg.sender, msg.value);
    }

    /// @notice Withdraw BOT from the pool (owner only)
    function withdraw(uint256 amount) external onlyOwner {
        if (amount > totalDeposited - totalLent) revert InsufficientLiquidity();
        totalDeposited -= amount;
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "ETH transfer failed");
        emit LiquidityWithdrawn(msg.sender, amount);
    }

    /// @notice Lock funds for a credit line (called by CreditLine only)
    function provideLiquidity(uint256 amount) external {
        if (msg.sender != authorizedCaller) revert UnauthorizedCaller();
        if (amount == 0) revert ZeroAmount();
        if (totalLent + amount > totalDeposited) revert InsufficientLiquidity();
        totalLent += amount;
        emit LiquidityProvided(amount);
    }

    /// @notice Release funds when credit is repaid (called by CreditLine only)
    function retractLiquidity(uint256 amount) external {
        if (msg.sender != authorizedCaller) revert UnauthorizedCaller();
        totalLent -= amount;
        emit LiquidityRetracted(amount);
    }

    /// @notice Available liquidity = total deposited - total lent
    function getAvailableLiquidity() external view returns (uint256) {
        return totalDeposited - totalLent;
    }

    /// @notice Pool utilization in basis points (0-10000)
    function getPoolUtilization() external view returns (uint256) {
        if (totalDeposited == 0) return 0;
        return (totalLent * 10000) / totalDeposited;
    }

    /// @dev Accept ETH for deposits
    receive() external payable {
        totalDeposited += msg.value;
        emit LiquidityDeposited(msg.sender, msg.value);
    }
}
