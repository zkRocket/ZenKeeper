// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IZKRocket.sol";
import "../types/provenData.sol";

interface IApplication {
    function execute(address _vault, address _user, uint256 _amount, ProvenData calldata _info) external;
}

