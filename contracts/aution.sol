// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts@5.4.0/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts@5.4.0/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts@5.4.0/token/ERC20/extensions/IERC20Permit.sol";
import "@openzeppelin/contracts@5.4.0/access/AccessControl.sol";

interface IRegisterApplication {
    function registerApplication(uint256 protocolId, address protocolAddress) external;
}

contract DutchAuctionLauncher is AccessControl, ReentrancyGuard {
    IERC20 public immutable token;
    uint256 public duration;
    uint256 public minPrice;
    address public developer;
    uint256 public nextProtocolId = 1;

    IRegisterApplication public zkRocket;

    //variables for each auction
    uint256 public auctionDuration;
    uint256 public auctionMinPrice;
    uint256 public auctionStartPrice;
    uint256 public auctionStartTime;

    struct BidRecord {
        uint256 protocolId;
        address protocolAddress;
        address buyer;
        uint256 price;
        uint256 time;
    }
    mapping (uint256 => BidRecord) public bidRecords;

    event AuctionStarted(uint256 indexed protocolId, uint256 startPrice, uint256 startTime, uint256 duration);
    event AuctionSuccess(uint256 indexed protocolId, address indexed protocolAddress, address indexed buyer,uint256 price, uint256 time);
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
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);

        require(_token != address(0), "Invalid token address");
        require(_duration > 0, "Invalid duration");
        require(_minPrice > 0, "Invalid minPrice");
        require(_developer != address(0), "Invalid developer address");
        require(_zkRocket != address(0), "Invalid zkRocket address");
        token = IERC20(_token);
        duration = _duration;
        minPrice = _minPrice;
        developer = _developer;
        zkRocket = IRegisterApplication(_zkRocket);

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
    function bid(address _protocolAddress, uint256 _price) public auctionOngoing nonReentrant  {
        uint256 expectedPrice = getCurrentPrice();
        require(_price >= expectedPrice, "pirce is lower than expected");

        bool success = token.transferFrom(msg.sender, developer, _price);
        require(success, "Transfer failed");

        BidRecord memory _bid = BidRecord({
            protocolId: nextProtocolId,
            protocolAddress: _protocolAddress,
            buyer: msg.sender,
            price: _price,
            time: block.timestamp
        });

        bidRecords[nextProtocolId] = _bid;
        zkRocket.registerApplication(nextProtocolId, _protocolAddress);
        emit AuctionSuccess(nextProtocolId, _protocolAddress, msg.sender, _price, block.timestamp);


        // start next auction immediately
        nextProtocolId++;

        // auctionStartPrice = max(newMinPrice, price *2)
        auctionStartPrice = _price * 2 >= minPrice ? _price * 2 : minPrice;
        auctionMinPrice = minPrice;
        auctionDuration = duration;
        auctionStartTime = block.timestamp;
        emit AuctionStarted(nextProtocolId, auctionStartPrice, auctionStartTime, auctionDuration);
    }

    /// TODO， bidWithPermit
    function bidWithPermit(
        address _protocolAddress,
        uint256 _price,
        uint256 _deadline,
        uint8 _v,
        bytes32 _r,
        bytes32 _s
    ) external auctionOngoing nonReentrant {
        IERC20Permit(address(token)).permit(
            msg.sender,
            address(this),
            _price,
            _deadline,
            _v, _r, _s
        );

        bid(_protocolAddress, _price);
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

    function modifyDeveloper(address _developer) external onlyAdmin {
        require(_developer != address(0), "Invalid developer address");
        address old = developer;
        developer = _developer;
        emit DeveloperUpdated(old, developer);
    }

}
