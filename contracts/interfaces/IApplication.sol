// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ProvenData} from "../types/provenData.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";

interface IApplication is IERC165 {
    // _appDataOffset is the offset of appData within _info.data
    function execute(address _vault, address _user, bytes32 _txid, uint256 _amount, ProvenData calldata _info, uint8 _appDataOffset) external;
}

