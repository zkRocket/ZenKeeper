// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IVault {
    event Credit(address indexed user, uint256 amount);
    event Settle(address indexed user, uint256 amount);

    function credit(address _to, uint256 _amount) external;
    function settle(address _to, uint256 _amount) external;
}

