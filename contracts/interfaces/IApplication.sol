// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
interface IApplication {
    function execute(address _vault, address _user, bool _withdraw, uint256 _amount, bytes calldata _data) external;
}

