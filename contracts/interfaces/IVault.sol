// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
interface IVault {
    event Deposit(address indexed user, uint256 amount);
    event Withdraw(address indexed user, uint256 amount);
    event Claim(address indexed user, uint256 amount);

    function claim(address _to, uint256 _amount, bool _withdrawal) external;
}

