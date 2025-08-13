// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
interface IVault {
    function claim(address token, address to, uint256 amount, bool withdrawal) external;
}

