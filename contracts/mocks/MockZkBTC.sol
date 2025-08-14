// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockZkBTC is ERC20 {
    constructor() ERC20("ZkBTC", "ZkBTC") {}

    function mint(address account, uint256 amount) public {
        _mint(account, amount);
    }
}
