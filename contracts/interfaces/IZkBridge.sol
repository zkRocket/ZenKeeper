// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
    struct ProvenData {
        uint32 index;
        bytes32 blockHash;
        uint64 associatedAmount;
        bytes data;
        bool retrieved;
    }

interface ReserveInterface {
    function retrieve(ProvenData calldata info, bytes32 txid) external;
}

/*
测试步骤：
1. deploy zkBTC
2. deploy vault, mint zkBTC to vault
3. deploy zkApp
4. deploy zkRocket
4.1 set EOA as zkRocket's AuctionLauncher
4.2 add (protocolId, zkApp)
4.3 set EOA as zkRocket's Bridge Role
4.4 set zkRocket as vault's operator


       43D218197E8c5FBC0527769821503660861c7045
0x6a2c 3c725134d74D5c45B4E4ABd2e5e2a109b5541288 00000101dD870fA1b7C4700F2BD7f44238821C26f7392148

测试数据
txid: 0x82c68e42a344925588d5485ca1d910ea3e1f381dc9e9735d14e6574a7fc0518c

//zkBTC 直接到 user address
[1, "0x7ee2067f1b78df78daf9ae65248651d4e75585db2c1c880312d4919dc2d683d2", 10000000000000000000, "0x6a14dD870fA1b7C4700F2BD7f44238821C26f7392148", false]

//zkRocket control's vaultAddress, protocolId = 1, userWithdraw=true, no application data
[1, "0x7ee2067f1b78df78daf9ae65248651d4e75585db2c1c880312d4919dc2d683d2", 10000000000000000000, "0x6a2c43D218197E8c5FBC0527769821503660861c704500000101dD870fA1b7C4700F2BD7f44238821C26f7392148", false]

//zkRocket control's vaultAddress, protocolId = 1, userWithdraw=false, no application data
[1, "0x7ee2067f1b78df78daf9ae65248651d4e75585db2c1c880312d4919dc2d683d2", 10000000000000000000, "0x6a2c3c725134d74D5c45B4E4ABd2e5e2a109b554128800000100dD870fA1b7C4700F2BD7f44238821C26f7392148", false]

//Not zkRocket control's vaultAddress, protocolId = 1, userWithdraw=false, no application data
[1, "0x7ee2067f1b78df78daf9ae65248651d4e75585db2c1c880312d4919dc2d683d2", 10000000000000000000, "0x6a2c3c725134d74D5c45B4E4ABd2e5e2a109b554128800000100dD870fA1b7C4700F2BD7f44238821C26f7392148", false]


*/