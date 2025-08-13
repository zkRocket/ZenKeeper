// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;
import "../interfaces/IApplication.sol";

contract MockApp is IApplication {
    constructor(){}

    event Execute(bytes _data);

    function execute(bytes calldata _data) external {
        emit Execute(_data);
    }
}
