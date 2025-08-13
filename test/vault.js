const hre = require("hardhat");

describe("AuctionLauncher Contract", function () {
    let zkbtc, zkRocket, mockApp, auction;
    let owner, developer, user1, user2;

    const big18 = BigInt(10) ** BigInt(18);
    const initialBalance = BigInt(1000) * big18;

    beforeEach(async function () {
        [owner, developer, user1, user2] = await hre.ethers.getSigners();

        const ZKBTC = await hre.ethers.getContractFactory("MockZkBTC");
        zkbtc = await ZKBTC.deploy();
        await zkbtc.waitForDeployment();
        let zkbtcAddress = await zkbtc.getAddress();
        console.log("zkbtc deployed to:", zkbtcAddress);

        const ZKRocket = await hre.ethers.getContractFactory("ZKRocket");
        zkRocket = await ZKRocket.deploy(zkbtcAddress);
        await zkRocket.waitForDeployment();
        console.log("zkRocket deployed to:", await zkRocket.getAddress());

        const MockApp = await hre.ethers.getContractFactory("MockApp");
        mockApp = await MockApp.deploy();
        await mockApp.waitForDeployment();
        console.log("mockApp deployed to:", await mockApp.getAddress());

        const AuctionLauncher = await hre.ethers.getContractFactory("AuctionLauncher");
        auction = await AuctionLauncher.deploy(
            zkbtcAddress,
            3600,
            100n * big18,
            developer.address,
            await zkRocket.getAddress()
        );
        await auction.waitForDeployment();
        console.log("auction deployed to:", await auction.getAddress());

        await zkRocket.grantRole(
            await zkRocket.AUCTION_LAUNCHER_ROLE(),
            await auction.getAddress()
        );
    });

    it("deployed contracts", async function () {
        expect(await auction.zkBTC()).to.equal(await zkbtc.getAddress());
        expect(await auction.duration()).to.equal(3600);
        expect(await auction.minPrice()).to.equal(100n * big18);
        expect(await auction.developer()).to.equal(developer.address);
        expect(await auction.zkRocket()).to.equal(await zkRocket.getAddress());
    });
});
