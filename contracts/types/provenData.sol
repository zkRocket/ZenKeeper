// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
    struct ProvenData {
        uint32 index;
        bytes32 blockHash;
        uint64 associatedAmount;
        bytes data;
        bool retrieved;
    }
