// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {IERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";

interface IVault is IERC165 {
    event Credit(address indexed user, uint256 amount);
    event Settle(address indexed user, uint256 amount);

    function credit(address _to, uint256 _amount) external;
    function settle(address _to, uint256 _amount) external;
}

