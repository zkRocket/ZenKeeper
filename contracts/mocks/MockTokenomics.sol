// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

contract MockTokenomics {
    uint8 public constant NUMBER_ROUNDS = 10;
    uint64 public constant LARGE_AMOUNT_THRESHOLD = 210000000;
    uint8 public startRound;

    uint8[NUMBER_ROUNDS] public largeAmountFeeRates = [
    8,
    8,
    8,
    8, 8, 8, 8, 4, 2,
    1]; // in base point

    uint8[NUMBER_ROUNDS] public smallAmountFeeRates = [
    28,
    28,
    28,
    28, 28, 28, 28, 14, 7,
    3];

    function setStartRound(uint8 _startRound) external {
        startRound = _startRound;
    }
}
