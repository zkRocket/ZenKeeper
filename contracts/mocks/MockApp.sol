// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;
import "../interfaces/IApplication.sol";

contract MockApp is IApplication {
    constructor(){}

    event Execute(address indexed _vault, address indexed _user, uint256 _amount);

    function execute(address _vault, address _user, uint256 _amount, ProvenData calldata _data) external {
        emit Execute(_vault, _user, _amount);
    }
}
