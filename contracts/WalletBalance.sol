// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Manages student on-chain wallet balances.
contract WalletBalance {
    mapping(address => uint256) public balances;

    event TopUp(address indexed student, uint256 amount);
    event Spent(address indexed student, uint256 amount, bytes32 servicePointId);

    function topUp() external payable {
        require(msg.value > 0, "Amount required");
        balances[msg.sender] += msg.value;
        emit TopUp(msg.sender, msg.value);
    }

    function deductBalance(address student, uint256 amount, bytes32 servicePointId) external {
        require(balances[student] >= amount, "Insufficient balance");
        balances[student] -= amount;
        emit Spent(student, amount, servicePointId);
    }

    function getBalance(address student) external view returns (uint256) {
        return balances[student];
    }

    receive() external payable {
        balances[msg.sender] += msg.value;
        emit TopUp(msg.sender, msg.value);
    }
}
