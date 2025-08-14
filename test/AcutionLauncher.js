const {
    time,
    loadFixture,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { expect } = require("chai");

describe("AuctionLauncher", function () {
    let zkbtc, zkRocket, mockApp, auction;
    let owner, developer, user1, user2;
    const big18 = BigInt(10) ** BigInt(18);
    const DURATION = 24 * 60 * 60;
    const MIN_PRICE = 10n * big18;


    // We define a fixture to reuse the same setup in every test.
    // We use loadFixture to run this setup once, snapshot that state,
    // and reset Hardhat Network to that snapshot in every test.
    async function deployContracts() {
        // Contracts are deployed using the first signer/account by default
        [owner, developer, user1, user2] = await ethers.getSigners();

        const ZKBTC = await ethers.getContractFactory("MockZkBTC");
        zkbtc = await ZKBTC.deploy();
        await zkbtc.waitForDeployment();


        const ZKRocket = await ethers.getContractFactory("ZKRocket");
        zkRocket = await ZKRocket.deploy(await zkbtc.getAddress());
        await zkRocket.waitForDeployment();

        const MockApp = await ethers.getContractFactory("MockApp");
        mockApp = await MockApp.deploy();
        await mockApp.waitForDeployment();

        const AuctionLauncher = await ethers.getContractFactory("AuctionLauncher");
        auction = await AuctionLauncher.deploy(
            await zkbtc.getAddress(),
            DURATION,
            MIN_PRICE,
            developer.address,
            await zkRocket.getAddress()
        );
        await auction.waitForDeployment();

        await zkRocket.grantRole(
            await zkRocket.AUCTION_LAUNCHER_ROLE(),
            await auction.getAddress()
        );

        await zkRocket.grantRole(
            await zkRocket.BRIDGE_ROLE(),
            await owner.address
        );
    }

    beforeEach(async function (){
        await loadFixture(deployContracts);
    });

    describe("Deployment", function () {
        it("deploy contracts ", async function () {
            expect(await auction.duration()).to.equal(DURATION);
            expect(await auction.minPrice()).to.equal(MIN_PRICE);
            expect(await auction.developer()).to.equal(developer.address);
            expect(await auction.zkRocket()).to.equal(await zkRocket.getAddress());
            expect(await auction.token()).to.equal(await zkbtc.getAddress());

            expect(await zkRocket.zkBTC()).to.equal(await zkbtc.getAddress());
            expect(await zkRocket.hasRole(await zkRocket.AUCTION_LAUNCHER_ROLE(), auction.getAddress())).is.true;
            expect(await zkRocket.hasRole(await zkRocket.BRIDGE_ROLE(), owner.address)).is.true;
        });
    });

    describe("auction", function () {
        it("auction price calculation", async function () {
            const startPrice = await auction.auctionStartPrice();
            const minPrice = await auction.auctionMinPrice();
            const duration = await auction.auctionDuration();
            const protocolId = await auction.nextProtocolId();

            // initial Price
            expect(await auction.getCurrentPrice()).to.equal(startPrice);

            // 1/4 duration elapsed
            const quarterTime = Number(duration) / 2;
            await time.increase(quarterTime);
            let expectedPrice =
                startPrice - (startPrice - minPrice) * BigInt(quarterTime) / BigInt(duration);
            expect(await auction.getCurrentPrice()).to.equal(expectedPrice);

            // 1/2 duration elapsed
            await time.increase(quarterTime);
             expectedPrice =
                startPrice - (startPrice - minPrice) * BigInt(quarterTime) *BigInt(2) / BigInt(duration);
            expect(await auction.getCurrentPrice()).to.equal(expectedPrice);

            // 3/4 duration elapsed
            await time.increase(quarterTime);
            expectedPrice =
                startPrice - (startPrice - minPrice) * BigInt(quarterTime) *BigInt(3) / BigInt(duration);
            expect(await auction.getCurrentPrice()).to.equal(expectedPrice);

            //  duration elapsed
            await time.increase(quarterTime);
            expect(await auction.getCurrentPrice()).to.equal(expectedPrice);

            // 2*duration elapsed
            await time.increase(duration);
            expect(await auction.getCurrentPrice()).to.equal(minPrice);
            expect(await auction.nextProtocolId()).to.equal(protocolId);
        });

        it("bid in auction duration", async function () {
            //user1 bid protocolId = 1
            await zkbtc.mint(user1.address, MIN_PRICE * 2n);
            await zkbtc.connect(user1).approve(await auction.getAddress(), MIN_PRICE * 2n);

            const protocolAddr = await mockApp.getAddress();
            let bidPrice1 = await auction.getCurrentPrice() + 10n;

            await expect(
                auction.connect(user1).bid(protocolAddr, bidPrice1)
            ).to.emit(auction, "AuctionSuccess")
                .withArgs(
                    1, // protocolId
                    protocolAddr,
                    user1.address,
                    bidPrice1,
                    anyValue // time
                );

            // 检查代币确实转给了 developer
            expect(await zkbtc.balanceOf(developer.address)).to.equal(bidPrice1);

            // 检查 bidRecords 保存正确
            let bid = await auction.bidRecords(1);
            expect(bid.buyer).to.equal(user1.address);
            expect(bid.price).to.equal(bidPrice1);
            expect(bid.protocolId).to.equal(1);
            expect(bid.protocolAddress).to.equal(protocolAddr);

            // 检查 nextProtocolId
            expect(await auction.nextProtocolId()).to.equal(2);
            expect(await auction.getCurrentPrice()).to.equal(bidPrice1 * 2n);
            expect(await zkRocket.applications(1)).to.equal(protocolAddr);

            //user1 bid protocolId = 2
            await zkbtc.mint(user2.address, bidPrice1 * 2n);
            await zkbtc.connect(user2).approve(await auction.getAddress(), bidPrice1 * 2n);

            const halfTime = Number(await auction.auctionDuration()) / 2;
            await time.increase(halfTime);
            let bidPrice2 = await auction.getCurrentPrice();

            await expect(
                auction.connect(user2).bid(protocolAddr, bidPrice2)
            ).to.emit(auction, "AuctionSuccess")
                .withArgs(
                    2, // protocolId
                    protocolAddr,
                    user2.address,
                    bidPrice2,
                    anyValue // time
                );

            // 检查代币确实转给了 developer
            expect(await zkbtc.balanceOf(developer.address)).to.equal(bidPrice1 + bidPrice2);

            // 检查 bidRecords 保存正确
             bid = await auction.bidRecords(2);
            expect(bid.buyer).to.equal(user2.address);
            expect(bid.price).to.equal(bidPrice2);
            expect(bid.protocolId).to.equal(2);
            expect(bid.protocolAddress).to.equal(protocolAddr);

            // 检查 nextProtocolId
            expect(await auction.nextProtocolId()).to.equal(3);
            expect(await auction.getCurrentPrice()).to.equal(bidPrice2 * 2n);
            expect(await zkRocket.applications(2)).to.equal(protocolAddr);
        });


        it("bid after auction duration", async function () {
            //user1 bid protocolId = 1
            await zkbtc.mint(user1.address, MIN_PRICE * 2n);
            await zkbtc.connect(user1).approve(await auction.getAddress(), MIN_PRICE * 2n);

            const protocolAddr = await mockApp.getAddress();
            let bidPrice1 = await auction.getCurrentPrice() + 10n;

            await expect(
                auction.connect(user1).bid(protocolAddr, bidPrice1)
            ).to.emit(auction, "AuctionSuccess")
                .withArgs(
                    1, // protocolId
                    protocolAddr,
                    user1.address,
                    bidPrice1,
                    anyValue // time
                );

            // 检查代币确实转给了 developer
            expect(await zkbtc.balanceOf(developer.address)).to.equal(bidPrice1);

            // 检查 bidRecords 保存正确
            let bid = await auction.bidRecords(1);
            expect(bid.buyer).to.equal(user1.address);
            expect(bid.price).to.equal(bidPrice1);
            expect(bid.protocolId).to.equal(1);
            expect(bid.protocolAddress).to.equal(protocolAddr);

            // 检查 nextProtocolId
            expect(await auction.nextProtocolId()).to.equal(2);
            expect(await auction.getCurrentPrice()).to.equal(bidPrice1 * 2n);
            expect(await zkRocket.applications(1)).to.equal(protocolAddr);

            //user1 bid protocolId = 2
            await zkbtc.mint(user2.address, bidPrice1 * 2n);
            await zkbtc.connect(user2).approve(await auction.getAddress(), bidPrice1 * 2n);

            await time.increase(await auction.auctionDuration() + 10n);
            let bidPrice2 = await auction.getCurrentPrice();
            expect(bidPrice2).to.equal(MIN_PRICE);

            await expect(
                auction.connect(user2).bid(protocolAddr, bidPrice2)
            ).to.emit(auction, "AuctionSuccess")
                .withArgs(
                    2, // protocolId
                    protocolAddr,
                    user2.address,
                    bidPrice2,
                    anyValue // time
                );

            // 检查代币确实转给了 developer
            expect(await zkbtc.balanceOf(developer.address)).to.equal(bidPrice1 + bidPrice2);

            // 检查 bidRecords 保存正确
            bid = await auction.bidRecords(2);
            expect(bid.buyer).to.equal(user2.address);
            expect(bid.price).to.equal(bidPrice2);
            expect(bid.protocolId).to.equal(2);
            expect(bid.protocolAddress).to.equal(protocolAddr);

            // 检查 nextProtocolId
            expect(await auction.nextProtocolId()).to.equal(3);
            expect(await auction.getCurrentPrice()).to.equal(bidPrice2 * 2n);
            expect(await zkRocket.applications(2)).to.equal(protocolAddr);
        });
    });

    describe("modify params", function () {
        it("modify duration", async function () {
            const newDuration = 48 * 60 * 60; // 48小时
            await expect(
                auction.connect(owner).modifyDuration(newDuration)
            ).to.emit(auction, "DurationUpdated").
            withArgs(DURATION,
                newDuration
            );

            expect(await auction.duration()).to.equal(newDuration);
            expect(await auction.auctionDuration()).to.equal(DURATION);

            // current auction will not be affected
            await zkbtc.mint(user1.address, MIN_PRICE * 2n);
            await zkbtc.connect(user1).approve(await auction.getAddress(), MIN_PRICE * 2n);
            const protocolAddr = await mockApp.getAddress();
            await auction.connect(user1).bid(protocolAddr, await auction.getCurrentPrice());

            expect(await auction.duration()).to.equal(newDuration); // 仍是新值
            expect(await auction.auctionDuration()).to.equal(newDuration);
        });

        it("modify minPrice", async function () {
            const newMinPrice = MIN_PRICE * 10n;
            await expect(
                auction.connect(owner).modifyMinPrice(newMinPrice)
            ).to.emit(auction, "MinPriceUpdated").
            withArgs(MIN_PRICE,
                newMinPrice
            );

            expect(await auction.minPrice()).to.equal(newMinPrice);
            expect(await auction.auctionMinPrice()).to.equal(MIN_PRICE);

            // current auction will not be affected
            await zkbtc.mint(user1.address, MIN_PRICE * 2n);
            await zkbtc.connect(user1).approve(await auction.getAddress(), MIN_PRICE * 2n);
            const protocolAddr = await mockApp.getAddress();
            await auction.connect(user1).bid(protocolAddr, await auction.getCurrentPrice());

            expect(await auction.minPrice()).to.equal(newMinPrice); // 仍是新值
            expect(await auction.auctionMinPrice()).to.equal(newMinPrice);
        });

        it ("modify developer", async function () {
            await expect(
                auction.connect(owner).modifyDeveloper(user2.address)
            ).to.emit(auction, "DeveloperUpdated").
            withArgs(developer.address,
                user2.address
            );
        });
    });
});
