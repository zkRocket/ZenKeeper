// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IVault {
    function claimZKBTC(address _to, uint256 _amount) external;
    function claimZKLIT(address _to, uint256 _amount) external;
}

