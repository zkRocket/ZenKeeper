// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "./interfaces/IZKRocket.sol";
import "./interfaces/IVault.sol";
import "./interfaces/ITokenomicsModel.sol";


contract ZKRocket is AccessControl {
    IERC20Metadata immutable public zkBTC;
    IERC20Metadata immutable public l2t;
    uint256 public zkBTCDecimals;
    uint256 public l2tDecimals;

    ITokenomicsModel immutable public tokenomicsModel;
    uint256 public immutable largeAmountThreshold;
    mapping(address => bool) public vaults;
    uint32 public nextProtocolId = 1;
    mapping(uint32 => IApplication) public applications;
    uint256[8] public l2tMintTable;

    /// @notice operator 角色标识
    bytes32 public constant AUCTION_LAUNCHER_ROLE = keccak256("AUCTION_LAUNCHER_ROLE");
    bytes32 public constant BRIDGE_ROLE = keccak256("BRIDGE_ROLE");

    event VaultAdded(address indexed vault);
    event VaultRemoved(address indexed vault);
    event ApplicationRegistered(uint32 indexed protocolId, address indexed protoclAddress);

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

    constructor(IERC20Metadata _zkBTC, IERC20Metadata _l2t, ITokenomicsModel _tokenomicsModel) {
        zkBTC = _zkBTC;
        l2t = _l2t;

        zkBTCDecimals = zkBTC.decimals();
        l2tDecimals = l2t.decimals();
        require(l2tDecimals >= zkBTCDecimals, "Decimals mismatch");
        uint256 decimalsDiff = l2tDecimals - zkBTCDecimals;
        l2tMintTable = [uint256(128*10**decimalsDiff), 64*10**decimalsDiff, 32*10**decimalsDiff, 16*10**decimalsDiff, 8*10**decimalsDiff, 4*10**decimalsDiff, 2*10**decimalsDiff, 1*10**decimalsDiff];

        tokenomicsModel = _tokenomicsModel;
        largeAmountThreshold = uint256(tokenomicsModel.LARGE_AMOUNT_THRESHOLD());

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
    /*           | <--------------------------------at least 45 bytes ------------------------->|
    fields:       OP_RETURN opcode     length     vaultAddress  chainId  protocolId   userAddress  appData
    length(bytes):    1        1       0/1/2/4        20            1           2         20
    */

    function retrieve(ProvenData calldata _info, bytes32 _txid) external onlyBridge {
       require(_info.data.length >= 45, "Invalid data");

        bytes calldata data = _info.data;
        (uint256 l, uint8 offset) = parsePushData(data[1:]); // data[0] is OP_RETURN
        uint8 vaultAddressOffset = offset + 1;
        require(l + vaultAddressOffset == data.length, "Invalid data length");

        address vaultAddress = bytesToAddress(data[vaultAddressOffset:]);
        uint8 chainId = uint8(data[vaultAddressOffset + 20]);
        require (chainId == 0, "not intended for Ethereum");

        (uint32 protocolId, uint8 offset2) = parsePushData(data[vaultAddressOffset+21 :]);
        uint8 userAddressOffset = vaultAddressOffset + 21 + offset2;
        address userAddress = bytesToAddress(data[userAddressOffset:]);

        uint256 zkBTCAmount = calculateZKBTCAmount(_info.associatedAmount);
        address appAddress = address(applications[protocolId]);

        // asset security: each vault and application must ensure having been passed user assets before crediting or transferring assets to users
        if (vaults[vaultAddress]) {
            IVault(vaultAddress).credit(userAddress, zkBTCAmount);

            if ((appAddress != vaultAddress) && (appAddress != address(0))) {
                uint256 l2tAmount = calculateL2TAmount(_info.associatedAmount);
                if (l2tAmount > 0){
                    IVault(vaultAddress).settle(appAddress, l2tAmount);
                }
            }
        }

        if (appAddress != address(0)) {
            IApplication(appAddress).execute(vaultAddress, userAddress, _txid, zkBTCAmount, _info);
        }
    }

    function parsePushData(bytes memory data) private pure returns (uint32 length, uint8 offset) {
        uint8 opcode = uint8(data[0]);
        if (1 <= opcode && opcode <= 0x4B) {
            length = uint32(opcode);
            offset = 1;
        } else if (opcode == 0x4C) {
            length = uint32(uint8(data[1]));
            offset = 2;
        } else if (opcode == 0x4D) {
            length = (uint32(uint8(data[2]))) << 8 + uint32(uint8(data[1]));
            offset = 3;
        } else if (opcode == 0x4E) {
            length = (uint32(uint8(data[4])) << 24) +
                    (uint32(uint8(data[3])) << 16) +
                    (uint32(uint8(data[2])) << 8) + 
                    uint32(uint8(data[1]));
            offset = 5;
        }
    }

    function bytesToAddress(bytes memory data) private pure returns (address result) {
        assembly {
            result := shr(96, mload(add(data, 0x20)))
        }
    }

    function calculateL2TAmount(uint256 _zkBTCAmount) public view returns (uint256) {
        uint256 round = tokenomicsModel.startRound();

        if (round < l2tMintTable.length) {
            return (_zkBTCAmount * l2tMintTable[round] * 9)/10;
        }
        return 0;
    }

    function calculateZKBTCAmount(uint256 _zkBTCAmount) public view returns (uint256) {
        uint256 round = tokenomicsModel.startRound();
        uint256 feeRate = 0;
        if (_zkBTCAmount < largeAmountThreshold) {
            feeRate = tokenomicsModel.smallAmountFeeRates(round);
        }else {
            feeRate = tokenomicsModel.largeAmountFeeRates(round);
        }

        uint256 fee = _zkBTCAmount * feeRate / 10000;
        return _zkBTCAmount - fee;
    }

}
