// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IZkRockets.sol";
import "../types/provenData.sol";

interface IApplication {
    // _appOffset is the offset of appData within _info.data
    function execute(address _vault, address _user, bytes32 _txid, uint256 _amount, ProvenData calldata _info, uint8 _appDataOffset) external;
}

