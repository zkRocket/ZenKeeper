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
        console.log("zkbtc deployed to:", await zkbtc.getAddress());


        const ZKRocket = await ethers.getContractFactory("ZKRocket");
        zkRocket = await ZKRocket.deploy(await zkbtc.getAddress());
        await zkRocket.waitForDeployment();
        console.log("zkRocket deployed to:", await zkRocket.getAddress());

        const MockApp = await ethers.getContractFactory("MockApp");
        mockApp = await MockApp.deploy();
        await mockApp.waitForDeployment();
        console.log("mockApp deployed to:", await mockApp.getAddress());

        const AuctionLauncher = await ethers.getContractFactory("AuctionLauncher");
        auction = await AuctionLauncher.deploy(
            await zkbtc.getAddress(),
            DURATION,
            MIN_PRICE,
            developer.address,
            await zkRocket.getAddress()
        );
        await auction.waitForDeployment();
        console.log("auction deployed to:", await auction.getAddress());

        await zkRocket.grantRole(
            await zkRocket.AUCTION_LAUNCHER_ROLE(),
            await auction.getAddress()
        );

        await zkRocket.grantRole(
            await zkRocket.BRIDGE_ROLE(),
            await owner.address
        );
    }

    describe("Deployment", function () {
        it("deploy contracts", async function () {
            await loadFixture(deployContracts);
            expect(await auction.duration()).to.equal(DURATION);
            expect(await auction.minPrice()).to.equal(MIN_PRICE);
            expect(await auction.developer()).to.equal(developer.address)
        });
    });
});
