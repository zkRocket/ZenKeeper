// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
interface IVault {
    function claim(address _token, address _to, uint256 _amount, bool _withdrawal) external;
}

