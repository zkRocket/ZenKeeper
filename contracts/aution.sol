// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts@5.4.0/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts@5.4.0/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts@5.4.0/access/AccessControl.sol";

interface IAddApplication {
    function addApplication(uint256 protocolId, address protocolAddress) external;
}

contract DutchAuctionLauncher is AccessControl, ReentrancyGuard {
    IERC20 public immutable token;
    uint256 public duration;
    uint256 public minPrice;
    bool public minPriceChanged;
    address public developer;
    uint256 public nextProtocolId = 1;

    IAddApplication public zkRocket;

    //variables for each auction
    uint256 public auctionDuration;
    uint256 public auctionMinPrice;
    uint256 public auctionStartPrice;
    uint256 public auctionStartTime;


    struct BidRecord {
        uint256 round;
        address buyer;
        uint256 protocolId;
        address protocolAddress;
        uint256 price;
        uint256 time;
    }
    mapping (uint256 => BidRecord) public bidRecords;

    event AuctionStarted(uint256 protocolId, uint256 startPrice, uint256 startTime, uint256 duration);
    event AuctionSuccess(uint256 protocolId, address buyer, uint256 price, uint256 time);
    event FundsWithdrawn(address to, uint256 amount);
    event MinPriceUpdated(uint256 oldMinPrice, uint256 newMinPrice);
    event DurationUpdated(uint256 oldDuration, uint256 newDuration);
    event DeveloperUpdated(address oldDeveloper, address newDeveloper);

    modifier auctionOngoing() {
        require(block.timestamp >= auctionStartTime, "Not started");
        _;
    }

    modifier onlyAdmin() {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Caller is not admin");
        _;
    }


    constructor(address _token, uint256 _duration, uint256 _minPrice, address _developer, address _zkRocket) {
        grantRole(DEFAULT_ADMIN_ROLE, msg.sender);

        require(_token != address(0), "Invalid token address");
        require(_duration > 0, "Invalid duration");
        require(_minPrice > 0, "Invalid minPrice");
        require(_developer != address(0), "Invalid developer address");
        require(_zkRocket != address(0), "Invalid zkRocket address");
        token = IERC20(_token);
        duration = _duration;
        minPrice = _minPrice;
        developer = _developer;
        zkRocket = IAddApplication(_zkRocket);
        minPriceChanged = false;

        startAuction();
    }

    function startAuction( ) internal {
        auctionStartPrice = minPrice;
        auctionMinPrice = minPrice;
        auctionDuration = duration;
        auctionStartTime = block.timestamp;
        emit AuctionStarted(nextProtocolId, auctionStartPrice, auctionStartTime, duration);
    }

    /// @notice 用户参与拍卖（先到先得）
    function bid(address protocolAddress) external auctionOngoing nonReentrant  {
        uint256 price = getCurrentPrice();
        bool success = token.transferFrom(msg.sender, developer, price);
        require(success, "Transfer failed");

        BidRecord memory _bid = BidRecord({
            round: nextProtocolId,
            buyer: msg.sender,
            protocolId: nextProtocolId,
            protocolAddress: protocolAddress,
            price: price,
            time: block.timestamp
        });

        bidRecords[nextProtocolId] = _bid;
        IAddApplication(protocolAddress).addApplication(nextProtocolId, protocolAddress);
        emit AuctionSuccess(nextProtocolId, msg.sender, price, block.timestamp);


        // start next auction immediately
        nextProtocolId++;
        // update min price if it changed or use previous
        if (minPriceChanged) {
            auctionStartPrice = minPrice;
            auctionMinPrice = minPrice;
            minPriceChanged = false;
        }else{
            auctionStartPrice = price * 2;
        }
        auctionDuration = duration;
        auctionStartTime = block.timestamp;

        emit AuctionStarted(nextProtocolId, auctionStartPrice, auctionStartTime, auctionDuration);
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


    //modify duration, which will be applied to next auction
    function modifyDuration(uint256 _duration) external onlyAdmin {
        require(_duration > 0, "Invalid duration");
        uint256 old = duration;
        duration = _duration;
        emit DurationUpdated(old, duration);
    }
    //modify min price, which will be applied to next auction
    function modifyMinPrice(uint256 _minPrice) external onlyAdmin {
        require(_minPrice > 0, "Invalid minPrice");
        uint256 old = minPrice;
        minPrice = _minPrice;
        minPriceChanged = true;
        emit MinPriceUpdated(old, minPrice);
    }

    function modifyDeveloper(address _developer) external onlyAdmin {
        require(_developer != address(0), "Invalid developer address");
        address old = developer;
        developer = _developer;
        emit DeveloperUpdated(old, developer);
    }

}
