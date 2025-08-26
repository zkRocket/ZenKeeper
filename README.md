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

## 测试准备
- deploy zkBTC
- deploy zkRocket
- deploy mokcApp
- deploy auction
- deploy vault
- 将vault 增加到zkRocket中
- 将zkRocket 设置为vault 的OPERATOR_ROLE
- 将Auction 设置为zkRocket的AUCTION_ROLE
- 将EOA owner 设置为zkRocket的BRIDGE_ROLE 

