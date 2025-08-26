# ZenKeeper
The ZenKeeper Protocol, a protocol for Bitcoin-based assets, based on the zkBTC cross-chain capabilities.

## Vault 合约
Vault 是一个可托管zkBTC资产的金库合约，在deposit时，用于接收过桥的zkBTC 以及奖励的的L2T Token. 该合约提供一个credit和settle接口，
- credit：用于在vault合约中给用户zkBTC记账。
- settle：将vault合约中的L2T转移到别的地址
这两个接口应该只被有特定权限的合约访问，例如zkRocket 或者zkApp
```solidity
    function credit(address _to, uint256 _amount) onlyOperator external {
        require(_to != address(0), "Invalid recipient");
        require(_amount > 0, "Amount must be > 0");
        require (zkBTC.balanceOf(address(this)) >= _amount, "Vault balance too low");
        balances[_to] += _amount;
        emit Credit(_to, _amount);
    }

    function settle(address _to, uint256 _amount) onlyOperator external {
        require(_to != address(0), "Invalid recipient");
        require(_amount > 0, "Amount must be > 0");
        require (l2t.balanceOf(address(this)) >= _amount, "Vault balance too low");
        bool success = l2t.transfer(_to, _amount);
        require(success, "Transfer failed");
        emit Settle(_to, _amount);
    }

```
## zkRockets 合约
zkRocket 处理deposit 交易中OP_RETURN 后的数据
```
                   ｜<----------------------------------zkRockets--------------------------------->|----appData------->
    fields:       OP_REURN     opcode     length      addressA    chainId    protocolId    addressB     appData
    length(bytes):    1           1       0/1/2/4        20            1           2          20         xxx 
```
- addressA: zkBridge 处理deposit时，将过桥的zkBTC 以及奖励的的L2T Token 直接转账到该地址.addressA 3种可能:
   - 用户地址. 此时用户不参与zkRockets 协议。
   - zkRocket 控制的vault 地址。
   - zkRocket 上的应用(例如zkRunes)控制的vault 地址。 
- chainId: 因为支持从BTC 跨链到多条EVM链，用chainId跨链的目标链，0-eth 
- addressB: 用户指定的地址
- appData: zkRocket上的应用协议数据。

zkRocket 要实现如下 retrieve 接口：
```solidity 
 function retrieve(ProvenData calldata info,bytes32 txid ) external;
```
### zkRockets 主要流程

#### 在zkBridge上注册 zkRockets 
```mermaid
sequenceDiagram
    participant adminstrator
    participant zkBridge

    adminstrator ->> zkBridge: updateReserveInterface(zkRocketAddress)
    zkBridge ->> zkBridge: reserveInterface = zkRocketAddress

```

#### 在zkRockets上注册应用协议
- aution 在拍卖成功后可以在zkRocket上注册应用。
```mermaid
sequenceDiagram
    participant aution
    participant zkRocket

    aution ->> zkRocket: registerApplication(protocolId, appAddress)
    zkRocket ->> zkRocket: appliations[protocolId] = appAddress
```
- zkRocket的adminstrator 也可以直接注册appliction
```mermaid
sequenceDiagram
    participant adminstrator
    participant zkRocket

    adminstrator ->> zkRocket: registerApplication(protocolId, appAddress)
    zkRocket ->> zkRocket: appliations[protocolId] = appAddress
```


#### 用户调用zkBridge 的retrieve 函数，触发zkRockets 处理 
```mermaid
sequenceDiagram
    participant user 
    participant zkBridge
    participant zkRocket
    participant vault
    participant zkApp 

user ->> zkBridge: retrieve(txid)
zkBridge ->> zkBridge: if retrieved == true, revert 
zkBridge ->> zkRocket: retrieve(index, blockHash, amount, data)
zkRocket ->> zkRocket: decode data 得到 vaultAddress, userAddress, protocolId
Note over zkRocket, vault: zkRocket's vault 
alt vault[vaultAddress] == true  //vault是zkRocket的金库
    zkRocket ->> vault: credit(userAddress, amount) //为用户的zkBTC 记账
    
    alt applications[protolId] != vaultAddress && applications[protolId] != address(0) //用户参与其他的应用
        zkRocket->>zkRocket: litAmount = calculateL2TAmount(_info.associatedAmount)    // 计算L2T 数量
        vault->>vault:  IVault(vaultAddress).settle(address(applications[protocolId]), litAmount) //将zkBTC转给用户
    end
end 


alt applications[protocolId] != address(0)
  zkRocket->>zkApp:  execute(vaultAddress, userAddress, amount, data)
else applications[protocolId] == address(0)
  Note over zkRocket, zkApp: do nothing 
end

```
## zkRockets 的应用合约
应用合约要实现如下execute 接口：
```solidity 
 function execute(address vaultAddress, addres userAddress, uint256 amount, Provendata data) external;
```

## 测试
### 测试准备
- deploy zkBTC: 0xeda25EC9CF6BF1800174080CDBddb5779F2F2c1b
- deploy L2T: 0xF04be284E514e18aF2A69cAC6C8977967581E461
- deploy vault: 0xBa633eE041e1854bF42A69578028b247d180583D
- deploy feepool: 0x09feeCff308d1f2fDAD8350257B9eDE28AC7d867
- deploy zkRocket: 0x3637D61702d54e2a2325165A4664d731bFf9f82F
- deploy mokcApp1: 0xe8311A3eDDB232ED554883d937257E5D5D45b029
- deploy mockApp2: 0x868E9389C39B4ceD8CC0657fDde86f493B07A7ec
- deploy 盲盒: 
- zkRocket中添加 mockApp1, 协议代号1: https://sepolia.etherscan.io/tx/0x64e763c9297377bdf4e884660a1f23b05bc34caab8fd8f0177e32a1399bc1970
- zkRocket中添加 mockApp2， 协议代号2: https://sepolia.etherscan.io/tx/0xd9cf0bc572b2070bee636c6cb68e9ab6479983403b5abd29fab1c01bfca19b6e
- 将vault 增加到zkRocket中：https://sepolia.etherscan.io/tx/0xc1c4ec1ba58dfb12342e4ee7a9334afe333eb7932d9f447601c227bc0bbc8ce2

- mint 1000 zkBTC to vault: https://sepolia.etherscan.io/tx/0x3233c69c6423af0e67e486d7ffecc7c70aed0fc9064ec042d1ff8b20e5ce98f8
- mint 128000 L2 to vault: https://sepolia.etherscan.io/tx/0x37ffda118a26003202f60afadaa68c431115c447fb0f73482e456234e982505c

- 将zkRocket 设置为vault 的OPERATOR_ROLE：
https://sepolia.etherscan.io/tx/0xa6aa5587cf29347bd5cc81680f1645b26135074129a133bce4a46c547e54a2c9

- 将EOA owner 设置为zkRocket的BRIDGE_ROLE ：https://sepolia.etherscan.io/tx/0x87d69ec05a672d117426a7c7ace3d69be7b116e516153a97cb5fca7685986a7a

### 测试用例(旧版本的测试用例)
#### 转到用户地址
```js
provenData {
  index: 1,
  blockHash: '0x82c68e42a344925588d5485ca1d910ea3e1f381dc9e9735d14e6574a7fc0518c',
  associatedAmount: 100000000n,
  data: '0x6a146Ee0a1f264d6690Fa6DeC24ADb78AC291dF33d74',
  retrieved: false
}
txid = "0x82c68e42a344925588d5485ca1d910ea3e1f381dc9e9735d14e6574a7fc0518c";
```
https://sepolia.etherscan.io/tx/0xe690cf43411dea0dc85c075c7fb249c9ab0c781fb51f51bdf964158ebe80bf56

#### 转移到vault地址，但是参与mockApp，
```js
provenData {
  index: 1,
  blockHash: '0x82c68e42a344925588d5485ca1d910ea3e1f381dc9e9735d14e6574a7fc0518c',
  associatedAmount: 100000000n,
  data: '0x6a2bBa633eE041e1854bF42A69578028b247d180583D0000016Ee0a1f264d6690Fa6DeC24ADb78AC291dF33d74',
  retrieved: false
}
txid = "0x82c68e42a344925588d5485ca1d910ea3e1f381dc9e9735d14e6574a7fc0518c";
```
https://sepolia.etherscan.io/tx/0xb8faf3ae9306368a10db82402f1200961725c6c9b51308bb3d930dff10dcad93

#### 转移到mockApp地址， mockApp 同时不是受zkRocket控制的vault ，
```js
provenData {
  index: 1,
  blockHash: '0x82c68e42a344925588d5485ca1d910ea3e1f381dc9e9735d14e6574a7fc0518c',
  associatedAmount: 100000000n,
  data: '0x6a2b131d73C228BfA36F81f15D3052E0a723427494b00000016Ee0a1f264d6690Fa6DeC24ADb78AC291dF33d74',
  retrieved: false
}
txid = "0x82c68e42a344925588d5485ca1d910ea3e1f381dc9e9735d14e6574a7fc0518c";
```
https://sepolia.etherscan.io/tx/0x77dde119340efc496b583d525e088259e8af2736b966697d2c69c1581d72b41f

#### 转移到mockApp地址， mockApp 同时是受zkRocket控制的vault，
- add mockApp2 as zkRocket's vault: https://sepolia.etherscan.io/tx/0xf65f3fbac1ff0d14d5cbf46f2070c14cd9ecbc5376cad77cd2c18dd1fb55631e
- register mockApp2 into zkRocket
https://sepolia.etherscan.io/tx/0xf52ea241c75b2cfb37ec254dbd97dd22d91af9c71d72554eba92b594bd351d8d   
- grant zkRocket as operator to mockApp2
https://sepolia.etherscan.io/tx/0x3d68e104961103541138a9838438337c42faf465bfb1da1af6e698be487afc11   
- mint zkBTC to mockApp2:https://sepolia.etherscan.io/tx/0x3971ad84e4ef3f9f5986675aeeb5c730bb259e85068a3b230ce8f53909df8259
- mint L2T to mockApp2:https://sepolia.etherscan.io/tx/0xdfd76e69c868b13fe4dd0a2cc66d91890334399ad5d0351baa26ff6be28d686f 
```js
provenData {
  index: 1,
  blockHash: '0x82c68e42a344925588d5485ca1d910ea3e1f381dc9e9735d14e6574a7fc0518c',
  associatedAmount: 100000000n,
  data: '0x6a2b891bA1E6c999333f8245BA275d61F391439E37B40000036Ee0a1f264d6690Fa6DeC24ADb78AC291dF33d74',
  retrieved: false
}
txid = "0x82c68e42a344925588d5485ca1d910ea3e1f381dc9e9735d14e6574a7fc0518c";
```
https://sepolia.etherscan.io/tx/0x156c464d1acb0dc57ecb2973a3f727c821d2f8efa3456ff59f465f54b871b7dd

