// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../interfaces/IApplication.sol";
import {MockVault} from "./MockVault.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165.sol";

contract MockApp is IApplication, MockVault {
    constructor(IERC20 _zkBTC, IERC20 _l2t) MockVault(_zkBTC, _l2t) {}

    event Execute(address indexed _vault, address indexed _user, bytes32 _txid, uint256 _amount, uint8 _appOffset);

    function execute(address _vault, address _user, bytes32 _txid, uint256 _amount, ProvenData calldata _data, uint8 _appOffset) external {
        emit Execute(_vault, _user, _txid, _amount, _appOffset);
    }

    function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
        return
                interfaceId == type(IApplication).interfaceId || // 注册 execute 函数所在的接口
                super.supportsInterface(interfaceId);
    }
}
