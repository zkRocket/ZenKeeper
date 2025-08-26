// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../types/provenData.sol";
import "./IApplication.sol";

interface ReserveInterface {
    function retrieve(ProvenData calldata _info, bytes32 _txid) external;
}

interface IRegisterApplication {
    function registerApplication(IApplication _protocolAddress) external;
}
