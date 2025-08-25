// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IVault {
    event Deposit(address indexed token, address indexed user, uint256 amount);
    event Withdraw(address indexed token,address indexed user, uint256 amount);
    event Claim(address indexed token,address indexed user, uint256 amount);

    function deposit(IERC20 _token, uint256 _amount) external;
    function withdraw(IERC20 _token, uint256 _amount) external;
    function claim(IERC20 _token, address _to, uint256 _amount, bool _withdrawal) external;
}

