// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "./interfaces/IApplication.sol";
import {IVault} from "./interfaces/IVault.sol";
import "./interfaces/IZkBridge.sol";

contract Auction is AccessControl, ReentrancyGuard {
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

    event AuctionStarted(uint256 indexed round, uint256 startPrice, uint256 startTime, uint256 duration);
    event AuctionSuccess(uint256 indexed round, address indexed protocolAddress, address indexed buyer,uint256 price, uint256 time);
    event MinPriceUpdated(uint256 oldMinPrice, uint256 newMinPrice);
    event DurationUpdated(uint256 oldDuration, uint256 newDuration);
    event FeeRecipientUpdated(address oldFeeRecipient, address newFeeRecipient);

    modifier auctionOngoing() {
        require(block.timestamp >= auctionStartTime, "Not started");
        _;
    }

    modifier onlyAdmin() {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Caller is not admin");
        _;
    }

    constructor(IERC20 _zkBTC, uint256 _duration, uint256 _minPrice, address _feeRecipient) {
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

}