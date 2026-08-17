// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Maps student Ethereum addresses to verified UCT student status.
/// The admin portal calls this when credentials are issued or revoked.
contract StudentRegistry {
    address public university;

    mapping(address => bool) public isVerifiedStudent;
    mapping(address => bytes32) public studentNumberHash;

    event StudentRegistered(address indexed student, bytes32 studentNumberHash);
    event StudentRemoved(address indexed student);

    modifier onlyUniversity() {
        require(msg.sender == university, "Only UCT can call this");
        _;
    }

    constructor() {
        university = msg.sender;
    }

    function registerStudent(address studentAddress, bytes32 _studentNumberHash)
        external
        onlyUniversity
    {
        isVerifiedStudent[studentAddress] = true;
        studentNumberHash[studentAddress] = _studentNumberHash;
        emit StudentRegistered(studentAddress, _studentNumberHash);
    }

    function removeStudent(address studentAddress) external onlyUniversity {
        isVerifiedStudent[studentAddress] = false;
        emit StudentRemoved(studentAddress);
    }

    function checkStudent(address studentAddress) external view returns (bool) {
        return isVerifiedStudent[studentAddress];
    }
}
