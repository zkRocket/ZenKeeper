const {
    time,
    loadFixture,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { expect } = require("chai");

describe("ZkRocket", function () {
    let zkBTC, zkRocket, mockApp, mockVault;
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

        const ZkBTC = await ethers.getContractFactory("MockZkBTC");
        zkBTC = await ZkBTC.deploy();
        await zkBTC.waitForDeployment();


        // const ZkRocket.sol = await ethers.getContractFactory("ZkRocket.sol");
        // zkRocket = await ZkRocket.sol.deploy(await zkBTC.getAddress());
        // await zkRocket.waitForDeployment();

        const MockApp = await ethers.getContractFactory("MockApp");
        mockApp = await MockApp.deploy();
        await mockApp.waitForDeployment();


        const MockVault = await ethers.getContractFactory("MockVault");
        mockVault = await MockVault.deploy(await zkBTC.getAddress());
        await mockVault.waitForDeployment();


        const ZkRocket = await ethers.getContractFactory("ZkRocket");
        zkRocket = await ZkRocket.deploy(
            await zkBTC.getAddress(),
            DURATION,
            MIN_PRICE,
            developer.address,
        );
        await zkRocket.waitForDeployment();



        await zkRocket.addVault(await mockVault.getAddress());
        await zkBTC.mint(await mockVault.getAddress(), 1000n *big18);
        expect(await zkBTC.balanceOf(await mockVault.getAddress())).to.equal(1000n * big18);
        expect (await zkRocket.vaults(await mockVault.getAddress())).is.true;

        await mockVault.grantRole(
            await mockVault.OPERATOR_ROLE(),
            await zkRocket.getAddress()
        );

        // await zkRocket.grantRole(
        //     await zkRocket.AUCTION_LAUNCHER_ROLE(),
        //     await zkRocket.getAddress()
        // );

        await zkRocket.grantRole(
            await zkRocket.BRIDGE_ROLE(),
            await owner.address
        );
    }

    beforeEach(async function (){
        await loadFixture(deployContracts);
    });

    describe("auction", function () {
        it("auction price calculation", async function () {
            const startPrice = await zkRocket.auctionStartPrice();
            const minPrice = await zkRocket.auctionMinPrice();
            const duration = await zkRocket.auctionDuration();
            const round = await zkRocket.round();

            // initial Price
            expect(await zkRocket.getCurrentPrice()).to.equal(startPrice);

            // 1/4 duration elapsed
            const quarterTime = Number(duration) / 2;
            await time.increase(quarterTime);
            let expectedPrice =
                startPrice - (startPrice - minPrice) * BigInt(quarterTime) / BigInt(duration);
            expect(await zkRocket.getCurrentPrice()).to.equal(expectedPrice);

            // 1/2 duration elapsed
            await time.increase(quarterTime);
            expectedPrice =
                startPrice - (startPrice - minPrice) * BigInt(quarterTime) *BigInt(2) / BigInt(duration);
            expect(await zkRocket.getCurrentPrice()).to.equal(expectedPrice);

            // 3/4 duration elapsed
            await time.increase(quarterTime);
            expectedPrice =
                startPrice - (startPrice - minPrice) * BigInt(quarterTime) *BigInt(3) / BigInt(duration);
            expect(await zkRocket.getCurrentPrice()).to.equal(expectedPrice);

            //  duration elapsed
            await time.increase(quarterTime);
            expect(await zkRocket.getCurrentPrice()).to.equal(expectedPrice);

            // 2*duration elapsed
            await time.increase(duration);
            expect(await zkRocket.getCurrentPrice()).to.equal(minPrice);
            expect(await zkRocket.round()).to.equal(round);
        });

        it("bid in auction duration", async function () {
            //user1 bid protocolId = 1
            await zkBTC.mint(user1.address, MIN_PRICE * 2n);
            await zkBTC.connect(user1).approve(await zkRocket.getAddress(), MIN_PRICE * 2n);

            const protocolAddr = await mockApp.getAddress();
            let bidPrice1 = await zkRocket.getCurrentPrice() + 10n;

            await expect(
                zkRocket.connect(user1).bid(protocolAddr, bidPrice1)
            ).to.emit(zkRocket, "AuctionSuccess")
                .withArgs(
                    1, // protocolId
                    protocolAddr,
                    user1.address,
                    bidPrice1,
                    anyValue // time
                );

            // 检查代币确实转给了 developer
            expect(await zkBTC.balanceOf(developer.address)).to.equal(bidPrice1);


            // 检查 nextProtocolId
            expect(await zkRocket.round()).to.equal(2);
            expect(await zkRocket.getCurrentPrice()).to.equal(bidPrice1 * 2n);
            expect(await zkRocket.applications(1)).to.equal(protocolAddr);

            //user1 bid protocolId = 2
            await zkBTC.mint(user2.address, bidPrice1 * 2n);
            await zkBTC.connect(user2).approve(await zkRocket.getAddress(), bidPrice1 * 2n);

            const halfTime = Number(await zkRocket.auctionDuration()) / 2;
            await time.increase(halfTime);
            let bidPrice2 = await zkRocket.getCurrentPrice();

            await expect(
                zkRocket.connect(user2).bid(protocolAddr, bidPrice2)
            ).to.emit(zkRocket, "AuctionSuccess")
                .withArgs(
                    2, // protocolId
                    protocolAddr,
                    user2.address,
                    bidPrice2,
                    anyValue // time
                );

            // 检查代币确实转给了 developer
            expect(await zkBTC.balanceOf(developer.address)).to.equal(bidPrice1 + bidPrice2);


            // 检查 nextProtocolId
            expect(await zkRocket.round()).to.equal(3);
            expect(await zkRocket.getCurrentPrice()).to.equal(bidPrice2 * 2n);
            expect(await zkRocket.applications(2)).to.equal(protocolAddr);
        });


        it("bid after auction duration", async function () {
            //user1 bid protocolId = 1
            await zkBTC.mint(user1.address, MIN_PRICE * 2n);
            await zkBTC.connect(user1).approve(await zkRocket.getAddress(), MIN_PRICE * 2n);

            const protocolAddr = await mockApp.getAddress();
            let bidPrice1 = await zkRocket.getCurrentPrice() + 10n;

            await expect(
                zkRocket.connect(user1).bid(protocolAddr, bidPrice1)
            ).to.emit(zkRocket, "AuctionSuccess")
                .withArgs(
                    1, // protocolId
                    protocolAddr,
                    user1.address,
                    bidPrice1,
                    anyValue // time
                );

            // 检查代币确实转给了 developer
            expect(await zkBTC.balanceOf(developer.address)).to.equal(bidPrice1);


            // 检查 nextProtocolId
            expect(await zkRocket.round()).to.equal(2);
            expect(await zkRocket.getCurrentPrice()).to.equal(bidPrice1 * 2n);
            expect(await zkRocket.applications(1)).to.equal(protocolAddr);

            //user1 bid protocolId = 2
            await zkBTC.mint(user2.address, bidPrice1 * 2n);
            await zkBTC.connect(user2).approve(await zkRocket.getAddress(), bidPrice1 * 2n);

            await time.increase(await zkRocket.auctionDuration() + 10n);
            let bidPrice2 = await zkRocket.getCurrentPrice();
            expect(bidPrice2).to.equal(MIN_PRICE);

            await expect(
                zkRocket.connect(user2).bid(protocolAddr, bidPrice2)
            ).to.emit(zkRocket, "AuctionSuccess")
                .withArgs(
                    2, // protocolId
                    protocolAddr,
                    user2.address,
                    bidPrice2,
                    anyValue // time
                );

            // 检查代币确实转给了 developer
            expect(await zkBTC.balanceOf(developer.address)).to.equal(bidPrice1 + bidPrice2);


            // 检查 nextProtocolId
            expect(await zkRocket.round()).to.equal(3);
            expect(await zkRocket.getCurrentPrice()).to.equal(bidPrice2 * 2n);
            expect(await zkRocket.applications(2)).to.equal(protocolAddr);
        });
    });

    describe("modify params", function () {
        it("modify duration", async function () {
            const newDuration = 48 * 60 * 60; // 48小时
            await expect(
                zkRocket.connect(owner).modifyDuration(newDuration)
            ).to.emit(zkRocket, "DurationUpdated").
            withArgs(DURATION,
                newDuration
            );

            expect(await zkRocket.duration()).to.equal(newDuration);
            expect(await zkRocket.auctionDuration()).to.equal(DURATION);

            // current auction will not be affected
            await zkBTC.mint(user1.address, MIN_PRICE * 2n);
            await zkBTC.connect(user1).approve(await zkRocket.getAddress(), MIN_PRICE * 2n);
            const protocolAddr = await mockApp.getAddress();
            await zkRocket.connect(user1).bid(protocolAddr, await zkRocket.getCurrentPrice());

            expect(await zkRocket.duration()).to.equal(newDuration); // 仍是新值
            expect(await zkRocket.auctionDuration()).to.equal(newDuration);
        });

        it("modify minPrice", async function () {
            const newMinPrice = MIN_PRICE * 10n;
            await expect(
                zkRocket.connect(owner).modifyMinPrice(newMinPrice)
            ).to.emit(zkRocket, "MinPriceUpdated").
            withArgs(MIN_PRICE,
                newMinPrice
            );

            expect(await zkRocket.minPrice()).to.equal(newMinPrice);
            expect(await zkRocket.auctionMinPrice()).to.equal(MIN_PRICE);

            // current auction will not be affected
            await zkBTC.mint(user1.address, MIN_PRICE * 2n);
            await zkBTC.connect(user1).approve(await zkRocket.getAddress(), MIN_PRICE * 2n);
            const protocolAddr = await mockApp.getAddress();
            await zkRocket.connect(user1).bid(protocolAddr, await zkRocket.getCurrentPrice());

            expect(await zkRocket.minPrice()).to.equal(newMinPrice); // 仍是新值
            expect(await zkRocket.auctionMinPrice()).to.equal(newMinPrice);
        });

        it ("modify fee recipient", async function () {
            await expect(
                zkRocket.connect(owner).modifyFeeRecipient(user2.address)
            ).to.emit(zkRocket, "FeeRecipientUpdated").
            withArgs(developer.address,
                user2.address
            );
        });

        it("modify duration fail because not admin", async function () {
            const newDuration = 48 * 60 * 60; // 48小时
            await expect(
                zkRocket.connect(user1).modifyDuration(newDuration)
            ).to.be.revertedWith("Caller is not admin");
        });

        it("modify minPrice fail because not admin", async function () {
            const newMinPrice = MIN_PRICE * 10n;
            await expect(
                zkRocket.connect(user1).modifyMinPrice(newMinPrice)
            ).to.be.revertedWith("Caller is not admin");
        });

        it("modify feeRecipient fail because not admin", async function () {
             await expect(
                zkRocket.connect(user1).modifyFeeRecipient(user1.address)
            ).to.be.revertedWith("Caller is not admin");
        });

    });

});