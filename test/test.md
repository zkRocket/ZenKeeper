## 测试
### 测试准备
- deploy zkBTC: 0xeda25EC9CF6BF1800174080CDBddb5779F2F2c1b
- deploy L2T: 0xF04be284E514e18aF2A69cAC6C8977967581E461
- deploy vault: 0xBa633eE041e1854bF42A69578028b247d180583D
- deploy tokenomics: 0x7C51d7D336aFdAc8E0beD39D5AAdCE49084dCb41
- deploy zkRocket: 0x8670c96804f6eB4CC6A5bea61d94Cf7e81EFd7cC
- deploy mokcApp1: 0x17730D1B29766d1Ff32D1b5554850061d9Ab8178
- deploy mockApp2: 0x8723BD7363bd2eD14ED1914512fAFc15F7D727C8
- deploy 盲盒: 
- zkRocket中添加 mockApp1, 协议代号1: https://sepolia.etherscan.io/tx/0x00a1646bea29780000d0370ec1c3acaf99534f4e646e786f9c8262ba57948a73
- zkRocket中添加 mockApp2， 协议代号2:  https://sepolia.etherscan.io/tx/0xe7242697502290aa1762434e2de69a06c2e927733875733f5c3b0d9782539783
- 将vault 增加到zkRocket中：https://sepolia.etherscan.io/tx/0xbfd26579bd070f4a77f4efa635638be5049538ce67328dd0caac579a90e0b5fa

- mint 1000 zkBTC to vault: https://sepolia.etherscan.io/tx/0x3233c69c6423af0e67e486d7ffecc7c70aed0fc9064ec042d1ff8b20e5ce98f8
- mint 128000 L2 to vault: https://sepolia.etherscan.io/tx/0x37ffda118a26003202f60afadaa68c431115c447fb0f73482e456234e982505c

- 将zkRocket 设置为vault 的OPERATOR_ROLE：https://sepolia.etherscan.io/tx/0xa0e0c41c5272449e5990b261dec04a466eac09e84ff1f3aef73da849007fa61d

- 将keep EOA owner 设置为zkRocket的BRIDGE_ROLE ：https://sepolia.etherscan.io/tx/0x5c810f55b4c3617fe0229bc42cf783579e63d7d88a81fc3efd41814bfd60d80f

- 将tong的EOA 设置为zkRocket的BRIDGE_ROLE ：
  https://sepolia.etherscan.io/tx/0x0155a865ee3fdaf5459485115c72c90fe3b93e1cce338093e9357bfe39aa2170
  
- 将tong的EOA 设置为zkRocket的ADMIN_ROLE ：
https://sepolia.etherscan.io/tx/0xf125bbb42d136644dd4550b029a0c7b4479baccf2ef7de19c07d1d9c0088b061  

### 测试用例
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
[1, 0x82c68e42a344925588d5485ca1d910ea3e1f381dc9e9735d14e6574a7fc0518c,100000000,0x6a146Ee0a1f264d6690Fa6DeC24ADb78AC291dF33d74,false]
```
https://sepolia.etherscan.io/tx/0x2f4102941c16ee3590fb13584b4350d1bad73dbc992a05a9b3ed8bde28bf1ee5

#### 转移到vault地址，但是参与mockApp，
```js
txid = "0x82c68e42a344925588d5485ca1d910ea3e1f381dc9e9735d14e6574a7fc0518c";
[1, 0x82c68e42a344925588d5485ca1d910ea3e1f381dc9e9735d14e6574a7fc0518c,100000000,0x6a2bBa633eE041e1854bF42A69578028b247d180583D0000016Ee0a1f264d6690Fa6DeC24ADb78AC291dF33d74,false]
```
https://sepolia.etherscan.io/tx/0x0a3de729b8f465e443affd79cf320b0803e5e20f4064bee6cd20c6c261356595#eventlog

#### 转移到mockAp1p地址， mockApp 同时不是受zkRocket控制的vault ，
```js

txid = "0x82c68e42a344925588d5485ca1d910ea3e1f381dc9e9735d14e6574a7fc0518c";
[1, 0x82c68e42a344925588d5485ca1d910ea3e1f381dc9e9735d14e6574a7fc0518c,100000000,0x6a2b17730D1B29766d1Ff32D1b5554850061d9Ab81780000016Ee0a1f264d6690Fa6DeC24ADb78AC291dF33d74,false]
```
https://sepolia.etherscan.io/tx/0x5c70b6b12dff2a8524fbf3ee3cfd530625a64a4beb4e4401267442ac2d915a47

#### 转移到mockApp地址， mockApp 同时是受zkRocket控制的vault，
- add mockApp2 as zkRocket's vault:
https://sepolia.etherscan.io/tx/0xf8cfd4e360c8ecae9b1cd458bc45db4eef1aa829e9f212e0314e91b51e9bfeff

- grant zkRocket as operator to mockApp2
https://sepolia.etherscan.io/tx/0x96266a1e0f7866ce67411622f9006efee56dee8db1ab815aec9d0c57813bba14
- mint zkBTC to mockApp2:https://sepolia.etherscan.io/tx/0x40f320088ea171b515fee1820b91c97b015c014290cd6bbf81cf66f31c9c9336
- mint L2T to mockApp2: https://sepolia.etherscan.io/tx/0x30865675c04e6615523a1c5fbb71dbb5a1b278a5706cfe13ed4dd3a69a9bfb0b
```js

txid = "0x82c68e42a344925588d5485ca1d910ea3e1f381dc9e9735d14e6574a7fc0518c";
[1, 0x82c68e42a344925588d5485ca1d910ea3e1f381dc9e9735d14e6574a7fc0518c,100000000,0x6a2b8723BD7363bd2eD14ED1914512fAFc15F7D727C80000016Ee0a1f264d6690Fa6DeC24ADb78AC291dF33d74,false]
```
https://sepolia.etherscan.io/tx/0xae1120c4e943b24da117c639eefaa46fe14e1606976b974e837500f5b046a2eb

