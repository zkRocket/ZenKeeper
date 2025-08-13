// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
interface IApplication {
    function execute(bytes calldata) external;
}


interface IRegisterApplication {
    function registerApplication(uint256 protocolId, address protocolAddress) external;
}
