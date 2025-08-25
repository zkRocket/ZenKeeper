// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "./interfaces/IZKBridge.sol";
import "./interfaces/IVault.sol";
import "./interfaces/IApplication.sol";
import "hardhat/console.sol";

contract ZKRocket is AccessControl {
    IERC20 immutable public zkBTC;
    IERC20 immutable public zkLIT;
    mapping(address => bool) public vaults;
    uint16 public nextProtocolId = 1;
    mapping(uint16 => IApplication) public applications;

    /// @notice operator 角色标识
    bytes32 public constant AUCTION_LAUNCHER_ROLE = keccak256("AUCTION_LAUNCHER_ROLE");
    bytes32 public constant BRIDGE_ROLE = keccak256("BRIDGE_ROLE");

    event VaultAdded(address indexed vault);
    event VaultRemoved(address indexed vault);
    event ApplicationRegistered(uint16 indexed protocolId, address indexed protoclAddress);

    /// ---------- 修饰器 ----------
    modifier onlyAdmin() {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Caller is not admin");
        _;
    }

    modifier onlyBridge() {
        require(hasRole(BRIDGE_ROLE, msg.sender), "Caller is not bridge");
        _;
    }

    modifier onlyAuctionLauncher() {
        require(hasRole(AUCTION_LAUNCHER_ROLE, msg.sender), "Caller is not auction launcher");
        _;
    }

    modifier onlyAuctionLauncherOrAdmin() {
        require(hasRole(AUCTION_LAUNCHER_ROLE, msg.sender)||hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Caller is not auction launcher or admin");
        _;
    }

    constructor(IERC20 _zkBTC, IERC20 _zkLIT) {
        zkBTC = _zkBTC;
        zkLIT = _zkLIT;
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    /// @notice 添加新的 vault（仅限 admin）
    function addVault(address _vault) external onlyAdmin {
        require(_vault.code.length > 0, "Invalid vault address");
        vaults[_vault] = true;
        emit VaultAdded(_vault);
    }

    /// @notice 移除 vault（仅限 admin）
    function removeVault(address _vault) external onlyAdmin {
        require(vaults[_vault], "Vault not found");
        delete vaults[_vault];
        emit VaultRemoved(_vault);
    }

    /// @notice auction launcher register application
    function registerApplication(IApplication _protocolAddress) external onlyAuctionLauncherOrAdmin {
        applications[nextProtocolId] = _protocolAddress;
        emit ApplicationRegistered(nextProtocolId, address(_protocolAddress));
        nextProtocolId += 1;
     }

    /// @notice  only zkBridge
    /*           | <--------------------------------at least 46 bytes ----------------------------------->|
    fields:       OP_RETURN opcode     length     vaultAddress  chainId  protocolId  userOption userAddress  appData
    length(bytes):    1        1       0/1/2/4        20            1           2          1          20
    */

    function retrieve(ProvenData calldata _info, bytes32 _txid) external onlyBridge {
        if (_info.data.length < 46){
            return;
        }

        bytes memory data = _info.data;
        uint256 vaultAddressOffset = 0;

        {
            //data[0]=OP_RETURN,
            uint256 l;
            uint8 opcode = uint8(data[1]);
            if (0x2c <= opcode && opcode <= 0x4B) { //44 ~75
                l = opcode;
                vaultAddressOffset = 2;
            } else if (opcode == 0x4c) {
                l = uint8(data[2]);
                vaultAddressOffset = 3;
            } else if (opcode == 0x4d) {
                l = (uint16(uint8(data[2])) << 8) + uint8(data[3]);
                vaultAddressOffset = 4;
            } else if (opcode == 0x4e) {
                l = (uint32(uint8(data[2])) << 24) +
                    (uint32(uint8(data[3])) << 16) +
                    (uint32(uint8(data[4])) << 8) + uint32(uint8(data[5]));
                vaultAddressOffset = 6;
            }
            require(l == data.length-vaultAddressOffset, "Invalid data length");
        }

        // 解析字段
        address vaultAddress;
        address userAddress;

        assembly {
            vaultAddress := shr(96, mload(add(add(data, 0x20), vaultAddressOffset)))
            userAddress := shr(96, mload(add(add(data, 0x20), add(vaultAddressOffset, 24))))
           }

        uint16 protocolId = (uint16(uint8(data[vaultAddressOffset + 21])) << 8) | uint8(data[vaultAddressOffset + 22]);
        bool withdraw = data[vaultAddressOffset + 23] != 0;

        bytes memory appData = sliceFrom(data, vaultAddressOffset+44);

        if (vaults[vaultAddress]) {
            IVault(vaultAddress).claim(zkBTC, userAddress, _info.associatedAmount, withdraw);
            // IVault(vaultAddress).claim(zkLIT, userAddress, _info.associatedAmount, withdraw); //TODO(L2Token amount)
        }

        if (address(applications[protocolId]) != address(0)) {
            IApplication(applications[protocolId]). execute(vaultAddress, userAddress, withdraw, _info.associatedAmount, appData);
        }
    }

    function sliceFrom(bytes memory data, uint256 offset) public pure returns (bytes memory result) {
        require(offset <= data.length, "Offset out of bounds");

        uint256 newLength = data.length - offset;
        result = new bytes(newLength);

        assembly {
            let src := add(add(data, 0x20), offset) // 指向 data[offset] 的位置
            let dest := add(result, 0x20)           // 指向 result 内容开始位置

            for { let i := 0 } lt(i, newLength) { i := add(i, 0x20) } {
                mstore(add(dest, i), mload(add(src, i)))
            }
        }
    }
}
