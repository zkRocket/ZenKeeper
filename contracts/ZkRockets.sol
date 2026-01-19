// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";

import {IApplication, ProvenData, ReserveInterface, IRegisterApplication} from "./interfaces/IZkRockets.sol";
import {IVault} from "./interfaces/IVault.sol";
import {ITokenomicsModel} from "./interfaces/ITokenomicsModel.sol";

contract ZkRockets is AccessControl, ReserveInterface, IRegisterApplication {
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

    error CallerNotAdmin();
    error CallerNotBridge();
    error CallerNotAuctionLauncherOrAdmin();

    /// ---------- 修饰器 ----------
    modifier onlyAdmin() {
        if(!hasRole(DEFAULT_ADMIN_ROLE, msg.sender)){
            revert CallerNotAdmin();
        }
        _;
    }

    modifier onlyBridge() {
        if(!hasRole(BRIDGE_ROLE, msg.sender)){
            revert CallerNotBridge();
        }
        _;
    }

    modifier onlyAuctionLauncherOrAdmin() {
        if(!hasRole(AUCTION_LAUNCHER_ROLE, msg.sender) && !hasRole(DEFAULT_ADMIN_ROLE, msg.sender)){
            revert CallerNotAuctionLauncherOrAdmin();
        }
        _;
    }

    error DecimalsMismatch();
    constructor(IERC20Metadata _zkBTC, IERC20Metadata _l2t, ITokenomicsModel _tokenomicsModel) {
        zkBTC = _zkBTC;
        l2t = _l2t;

        zkBTCDecimals = zkBTC.decimals();
        l2tDecimals = l2t.decimals();
        if (l2tDecimals < zkBTCDecimals){
            revert DecimalsMismatch();
        }
        uint256 decimalsDiff = l2tDecimals - zkBTCDecimals;
        l2tMintTable = [uint256(128*10**decimalsDiff), 64*10**decimalsDiff, 32*10**decimalsDiff, 16*10**decimalsDiff, 8*10**decimalsDiff, 4*10**decimalsDiff, 2*10**decimalsDiff, 1*10**decimalsDiff];

        tokenomicsModel = _tokenomicsModel;
        largeAmountThreshold = uint256(tokenomicsModel.LARGE_AMOUNT_THRESHOLD());

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    error NotImplemented();
    /// @notice 添加新的 vault（仅限 admin）
    function addVault(IVault _vault) external onlyAdmin {
        require(address(_vault).code.length > 0, "Invalid vault address");

        bytes4 vaultInterfaceId = type(IVault).interfaceId;
        if(!IERC165(address(_vault)).supportsInterface(vaultInterfaceId)){
            revert NotImplemented();
        }

        vaults[address(_vault)] = true;
        emit VaultAdded(address(_vault));
    }

    /// @notice 移除 vault（仅限 admin）
    function removeVault(address _vault) external onlyAdmin {
        require(vaults[_vault], "Vault not found");
        delete vaults[_vault];
        emit VaultRemoved(_vault);
    }

    /// @notice auction launcher register application
    function registerApplication(IApplication _protocolAddress) external onlyAuctionLauncherOrAdmin {
        bytes4 executableInterfaceId = type(IApplication).interfaceId;
        if(!IERC165(address(_protocolAddress)).supportsInterface(executableInterfaceId)){
            revert NotImplemented();
        }

        applications[nextProtocolId] = _protocolAddress;
        emit ApplicationRegistered(nextProtocolId, address(_protocolAddress));
        nextProtocolId += 1;
     }

    /// @notice  only zkBridge
    /*           | <--------------------------------at least 45 bytes ------------------------->|
    fields:       OP_RETURN entire-length     vaultAddress  chainId  protocolId   userAddress  appData
    length(bytes):    1        1+x           20            1           1+x         20
    Note that both entire-length and protocolId are encoded in bitcoin pushdata
    */
    function retrieve(ProvenData calldata _info, bytes32 _txid) external onlyBridge {
        require(_info.data.length >= 45, "Invalid data");

        address vaultAddress;
        address userAddress;
        uint32 protocolId;
        uint8 userAddressOffset;

        {
            bytes calldata data = _info.data;
            (uint256 len, uint8 offset) = parsePushData(data[1:]); // data[0] is OP_RETURN
            uint8 vaultAddressOffset = offset + 1;
            require(len + vaultAddressOffset == data.length, "Invalid data length");

            vaultAddress = address(bytes20(data[vaultAddressOffset:vaultAddressOffset+20]));

            require(uint8(data[vaultAddressOffset + 20]) == 0, "not intended for Ethereum");

            uint8 offset2;
            (protocolId, offset2) = parsePushData(data[vaultAddressOffset + 21 :]);
            userAddressOffset = vaultAddressOffset + 21 + offset2;
            userAddress = address(bytes20(data[userAddressOffset:userAddressOffset+20]));
        }

        address appAddress = address(applications[protocolId]);
        uint256 zkBTCAmount = calculateZKBTCAmount(_info.associatedAmount);

        if (vaults[vaultAddress]) {
            IVault(vaultAddress).credit(userAddress, zkBTCAmount);

            if ((appAddress != vaultAddress) && (appAddress != address(0))) {
                uint256 l2tAmount = calculateL2TAmount(_info.associatedAmount);
                if (l2tAmount > 0) {
                    IVault(vaultAddress).settle(appAddress, l2tAmount);
                }
            }
        }

        if (appAddress != address(0)) {
            IApplication(appAddress).execute(
                vaultAddress,
                userAddress,
                _txid,
                zkBTCAmount,
                _info,
                userAddressOffset + 20
            );
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
