// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;
import "../interfaces/IApplication.sol";

contract MockApp is IApplication {
    constructor(){}

    event Execute(address indexed _vault, address indexed _user, bool _withdraw, uint256 _amount, bytes _data);

    function execute(address _vault, address _user, bool _withdraw, uint256 _amount, bytes calldata _data) external {
        emit Execute(_vault, _user, _withdraw, _amount, _data);
    }
}
