// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "./interfaces/IApplication.sol";
import {IVault} from "./interfaces/IVault.sol";
import "./interfaces/IZkBridge.sol";

contract ZkRocket is AccessControl, ReentrancyGuard {
    IERC20 public immutable zkBTC;
    uint256 public duration;
    uint256 public minPrice;
    address public feeRecipient;
    uint16 public round = 1;

    //variables for each auction
    uint256 public auctionDuration;
    uint256 public auctionMinPrice;
    uint256 public auctionStartPrice;
    uint256 public auctionStartTime;

    mapping(address => bool) public vaults;
    uint16 public nextProtocolId = 1;
    mapping(uint16 => IApplication) public applications;

    bytes32 public constant BRIDGE_ROLE = keccak256("BRIDGE_ROLE");

    event AuctionStarted(uint256 indexed round, uint256 startPrice, uint256 startTime, uint256 duration);
    event AuctionSuccess(uint256 indexed round, address indexed protocolAddress, address indexed buyer,uint256 price, uint256 time);
    event MinPriceUpdated(uint256 oldMinPrice, uint256 newMinPrice);
    event DurationUpdated(uint256 oldDuration, uint256 newDuration);
    event FeeRecipientUpdated(address oldFeeRecipient, address newFeeRecipient);

    event VaultAdded(address indexed vault);
    event VaultRemoved(address indexed vault);
    event ApplicationRegistered(uint16 indexed protocolId, address indexed protoclAddress);

    modifier auctionOngoing() {
        require(block.timestamp >= auctionStartTime, "Not started");
        _;
    }

    modifier onlyAdmin() {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Caller is not admin");
        _;
    }

    modifier onlyBridge() {
        require(hasRole(BRIDGE_ROLE, msg.sender), "Caller is not bridge");
        _;
    }


    constructor(IERC20 _zkBTC, uint256 _duration, uint256 _minPrice, address _feeRecipient) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);

        require(_duration > 0, "Invalid duration");
        require(_minPrice > 0, "Invalid minPrice");
        require(_feeRecipient != address(0), "Invalid developer address");
        zkBTC = _zkBTC;
        duration = _duration;
        minPrice = _minPrice;
        feeRecipient = _feeRecipient;

        startAuction();
    }

    function startAuction( ) internal {
        auctionStartPrice = minPrice;
        auctionMinPrice = minPrice;
        auctionDuration = duration;
        auctionStartTime = block.timestamp;
        emit AuctionStarted(round, auctionStartPrice, auctionStartTime, duration);
    }

    /// @notice 用户参与拍卖（先到先得）
    function bid(IApplication _protocolAddress, uint256 _price) public auctionOngoing nonReentrant  {
        uint256 expectedPrice = getCurrentPrice();
        require(_price >= expectedPrice, "price is lower than expected");

        bool success = zkBTC.transferFrom(msg.sender, feeRecipient, _price);
        require(success, "Transfer failed");

        _registerApplication(_protocolAddress);
        emit AuctionSuccess(uint256(round), address(_protocolAddress), msg.sender, _price, block.timestamp);

        // start next auction immediately
        round++;

        // auctionStartPrice = max(newMinPrice, price *2)
        auctionStartPrice = _price * 2 >= minPrice ? _price * 2 : minPrice;
        auctionMinPrice = minPrice;
        auctionDuration = duration;
        auctionStartTime = block.timestamp;
        emit AuctionStarted(round, auctionStartPrice, auctionStartTime, auctionDuration);
    }

    /// TODO， bidWithPermit
    function bidWithPermit(
        IApplication _protocolAddress,
        uint256 _price,
        uint256 _deadline,
        uint8 _v,
        bytes32 _r,
        bytes32 _s
    ) external auctionOngoing nonReentrant {
        IERC20Permit(address(zkBTC)).permit(
            msg.sender,
            address(this),
            _price,
            _deadline,
            _v, _r, _s
        );

        bid(_protocolAddress, _price);
    }


    /// @notice auction launcher register application
    function registerApplication(IApplication _protocolAddress) public onlyAdmin {
        _registerApplication(_protocolAddress);
    }

    function _registerApplication(IApplication _protocolAddress) internal {
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

        assembly { //TODO(ask tong)
            vaultAddress := shr(96, mload(add(add(data, 0x20), vaultAddressOffset)))
            userAddress := shr(96, mload(add(add(data, 0x20), add(vaultAddressOffset, 24))))
        }

        uint16 protocolId = (uint16(uint8(data[vaultAddressOffset + 21])) << 8) | uint8(data[vaultAddressOffset + 22]);
        bool withdraw = (uint8(data[vaultAddressOffset + 23]) & 0x01) != 0;

        bytes memory appData = sliceFrom(data, vaultAddressOffset+44);

        if (vaults[vaultAddress]) {
            IVault(vaultAddress).claim(userAddress, _info.associatedAmount, withdraw);
        }

        if (address(applications[protocolId]) != address(0)) {
            IApplication(applications[protocolId]).execute(vaultAddress, userAddress, withdraw, _info.associatedAmount, appData);
        }
    }


    /// @notice 实时计算当前价格（线性下降）
    function getCurrentPrice() public view returns (uint256) {
        uint256 elapsed = block.timestamp - auctionStartTime;
        if (elapsed >= auctionDuration) {
            return auctionMinPrice;
        }

        uint256 discount = ((auctionStartPrice - auctionMinPrice) * elapsed) / auctionDuration;
        return auctionStartPrice - discount;
    }


    //modify duration, will be applied to next auction
    function modifyDuration(uint256 _duration) external onlyAdmin {
        require(_duration > 0, "Invalid duration");
        uint256 old = duration;
        duration = _duration;
        emit DurationUpdated(old, duration);
    }
    //modify min price, will be applied to next auction
    function modifyMinPrice(uint256 _minPrice) external onlyAdmin {
        require(_minPrice > 0, "Invalid minPrice");
        uint256 old = minPrice;
        minPrice = _minPrice;
        emit MinPriceUpdated(old, minPrice);
    }

    function modifyFeeRecipient(address _feeRecipient) external onlyAdmin {
        require(_feeRecipient != address(0), "Invalid developer address");
        address old = feeRecipient;
        feeRecipient = _feeRecipient;
        emit FeeRecipientUpdated(old, feeRecipient);
    }
    /// @notice 添加新的 vault（仅限 admin)
    function addVault(IVault _vault) external onlyAdmin {
        address vaultAddr = address(_vault);
        vaults[vaultAddr] = true;
        emit VaultAdded(vaultAddr);
    }

    /// @notice 移除 vault（仅限 admin）.
    function removeVault(IVault _vault) external onlyAdmin {
        address vaultAddr = address(_vault);
        require(vaults[vaultAddr], "Vault not found");
        delete vaults[vaultAddr];
        emit VaultRemoved(vaultAddr);
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