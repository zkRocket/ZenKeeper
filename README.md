# ZenKeeper
The ZenKeeper Protocol, a protocol for Bitcoin-based assets, based on the zkBTC cross-chain capabilities.

## vault 合约
Vault 是一个可托管zkBTC资产的金库合约，在deposit时，用于接收过桥的zkBTC 以及奖励的的LIT Token. 该合约提供一个claim接口，允许有特定权限的人(例如zkBridge)将资产从vault 转移到用户，或者在vault中为用户记账。
```solidity
function claim(address token, address to, uint256 amount, bool withdrawal){
   if(withdrawal) {
      bool success = IERC20(token).transfer(to, amount);
    }else{
      balances[token][to] += amount;
   }
}
```
## Register zkRockets 

<img width="675" height="382" alt="image" src="https://github.com/user-attachments/assets/4ae09a99-4f57-48b5-82bd-cfe47a3b7ad3" />



<img width="852" height="594" alt="image" src="https://github.com/user-attachments/assets/a90a5e38-f7f5-40a4-9907-c951dd54bce2" />
