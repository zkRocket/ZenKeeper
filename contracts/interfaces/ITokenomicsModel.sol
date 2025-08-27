// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

interface ITokenomicsModel {
    function startRound() external view returns (uint8);
    function LARGE_AMOUNT_THRESHOLD() external view returns (uint64);
    function largeAmountFeeRates(uint256 _round) external view returns (uint256);
    function smallAmountFeeRates(uint256 _round) external view returns (uint256);
}
