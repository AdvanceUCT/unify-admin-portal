// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./StudentRegistry.sol";
import "./WalletBalance.sol";

/// @notice Processes campus payments with an automatic student discount via StudentRegistry.
contract StudentPayment {
    StudentRegistry public registry;
    WalletBalance public walletBalance;
    address public university;
    uint256 public studentDiscountBps = 2000;

    event PaymentProcessed(
        address indexed student,
        address indexed vendor,
        uint256 originalAmount,
        uint256 finalAmount,
        bool discountApplied,
        bytes32 servicePointId
    );

    constructor(address registryAddress, address walletBalanceAddress) {
        registry = StudentRegistry(registryAddress);
        walletBalance = WalletBalance(payable(walletBalanceAddress));
        university = msg.sender;
    }

    function pay(address payable vendor, bytes32 servicePointId) external payable {
        require(msg.value > 0, "Payment required");

        uint256 finalAmount = msg.value;
        bool discountApplied = false;

        if (registry.checkStudent(msg.sender)) {
            uint256 discount = (msg.value * studentDiscountBps) / 10000;
            finalAmount = msg.value - discount;
            payable(msg.sender).transfer(discount);
            discountApplied = true;
        }

        vendor.transfer(finalAmount);

        emit PaymentProcessed(
            msg.sender,
            vendor,
            msg.value,
            finalAmount,
            discountApplied,
            servicePointId
        );
    }

    function setDiscountBps(uint256 newBps) external {
        require(msg.sender == university, "Only UCT can update discount");
        require(newBps <= 10000, "Cannot exceed 100 percent");
        studentDiscountBps = newBps;
    }
}
