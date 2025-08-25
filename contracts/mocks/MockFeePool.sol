// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "../interfaces/IFeePool.sol";

contract MockFeePool is IFeePool {
    uint256 public totalBridgeAmount;

    function setTotalBridgeAmount(uint256 _totalBridgeAmount) external {
        totalBridgeAmount = _totalBridgeAmount;
    }
}
