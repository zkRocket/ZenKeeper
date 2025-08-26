const {
    time,
    loadFixture,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { expect } = require("chai");

describe("ZkRocket", function () {
    let zkBTC, l2t, zkRocket, mockApp, mockFeePool,auction, mockVault;
    let owner, feeRecipient, user1, user2;
    const big18 = BigInt(10) ** BigInt(18);
    const big10 = BigInt(10) ** BigInt(10);
    const big8 = BigInt(10) ** BigInt(8);
    const DURATION = 24 * 60 * 60;
    const MIN_PRICE = 10n * big18;

    // We define a fixture to reuse the same setup in every test.
    // We use loadFixture to run this setup once, snapshot that state,
    // and reset Hardhat Network to that snapshot in every test.
    async function deployContracts() {
        // Contracts are deployed using the first signer/account by default
        [owner, feeRecipient, user1, user2] = await ethers.getSigners();

        const ZKBTC = await ethers.getContractFactory("MockZKBTC");
        zkBTC = await ZKBTC.deploy();
        await zkBTC.waitForDeployment();

        const L2T = await ethers.getContractFactory("MockL2T");
        l2t = await L2T.deploy();
        await l2t.waitForDeployment();

        const MockFeePool = await ethers.getContractFactory("MockFeePool");
        mockFeePool = await MockFeePool.deploy();
        await mockFeePool.waitForDeployment();

        const ZKRocket = await ethers.getContractFactory("ZKRocket");
        zkRocket = await ZKRocket.deploy(await zkBTC.getAddress(), await l2t.getAddress(), await mockFeePool.getAddress());
        await zkRocket.waitForDeployment();

        const MockApp = await ethers.getContractFactory("MockApp");
        mockApp = await MockApp.deploy(await zkBTC.getAddress(), await l2t.getAddress());
        await mockApp.waitForDeployment();

        const AuctionLauncher = await ethers.getContractFactory("AuctionLauncher");
        auction = await AuctionLauncher.deploy(
            await zkBTC.getAddress(),
            DURATION,
            MIN_PRICE,
            feeRecipient.address,
            await zkRocket.getAddress()
        );
        await auction.waitForDeployment();

        const MockVault = await ethers.getContractFactory("MockVault");
        mockVault = await MockVault.deploy(await zkBTC.getAddress(), await l2t.getAddress());
        await mockVault.waitForDeployment();

        await zkRocket.addVault(await mockVault.getAddress());
        await zkBTC.mint(await mockVault.getAddress(), 1000n *big18);
        expect(await zkBTC.balanceOf(await mockVault.getAddress())).to.equal(1000n * big18);
        expect (await zkRocket.vaults(await mockVault.getAddress())).is.true;
        await l2t.mint(await mockVault.getAddress(), 100000n *big18);
        expect(await l2t.balanceOf(await mockVault.getAddress())).to.equal(100000n * big18);

        await mockVault.grantRole(
            await mockVault.OPERATOR_ROLE(),
            await zkRocket.getAddress()
        );

        await zkRocket.grantRole(
            await zkRocket.AUCTION_LAUNCHER_ROLE(),
            await auction.getAddress()
        );

        await zkRocket.grantRole(
            await zkRocket.BRIDGE_ROLE(),
            await owner.address
        );

        await zkBTC.mint(user1.address, MIN_PRICE * 2n);
        await zkBTC.connect(user1).approve(await auction.getAddress(), MIN_PRICE * 2n);

        const protocolAddr = await mockApp.getAddress();
        let bidPrice = await auction.getCurrentPrice() + 10n;

        await auction.connect(user1).bid(protocolAddr, bidPrice);
    }

    async function checkRetrieveAndBalances(data, amount, txid, zkRocket, zkBTC, l2t, mockVault, mockApp, owner) {
        const provenData = {
            index: 1,
            blockHash: txid,
            associatedAmount: amount, // 10*1e8
            data: data,
            retrieved: false
        };

        let vaultZKBTCBalanceBefore = await zkBTC.balanceOf(await mockVault.getAddress());
        expect(await zkBTC.balanceOf(await owner.address)).to.equal(0n);
        let vaultZKLITBalanceBefore = await l2t.balanceOf(await mockVault.getAddress());
        let appZKLITBalanceBefore = await l2t.balanceOf(await mockApp.getAddress());
        expect(appZKLITBalanceBefore).to.equal(0n);

        await expect(
            zkRocket.retrieve(provenData, txid)
        ).to.emit(mockApp, "Execute");

        let vaultZKBTCBalanceAfter = await zkBTC.balanceOf(await mockVault.getAddress());
        expect(vaultZKBTCBalanceBefore - vaultZKBTCBalanceAfter).to.equal(0n);
        expect(await mockVault.balances(await owner.address)).to.equal(amount);

        let vaultZKLITBalanceAfter = await l2t.balanceOf(await mockVault.getAddress());
        let appZKLITBalanceAfter = await l2t.balanceOf(await mockApp.getAddress());
        expect(vaultZKLITBalanceBefore - vaultZKLITBalanceAfter)
            .to.equal(appZKLITBalanceAfter - appZKLITBalanceBefore);

        let litAmount = await zkRocket.calculateLITAmount(amount);
        expect(appZKLITBalanceAfter).to.equal(litAmount);
    }

    beforeEach(async function (){
        await loadFixture(deployContracts);
    });

    describe("retrieve", function () {
        const txid = "0x82c68e42a344925588d5485ca1d910ea3e1f381dc9e9735d14e6574a7fc0518c";
        const blockHash = "0x7ee2067f1b78df78daf9ae65248651d4e75585db2c1c880312d4919dc2d683d2";
        const amount = 10n * big8;

        it("to user address", async function () {
            let data = "0x6a14" + owner.address.replace("0x", "")
            const provenData = {
                index: 1,
                blockHash: txid,
                associatedAmount: amount, // 10 * 1e8
                data: data,
                retrieved: false
            };

            await expect(
                zkRocket.retrieve(provenData, txid)
            ).to.not.be.reverted;
         });

        it("to MockVault address，no app data", async function () {
            let vaultAddress = await mockVault.getAddress();
            let data=  vaultAddress.replace("0x", "") + "00" + "0001" + owner.address.replace("0x", "")
            let len = (data.length/2).toString(16);
            data = "0x6a" + len + data;

            await checkRetrieveAndBalances(data, amount, txid, zkRocket, zkBTC, l2t, mockVault, mockApp, owner);

        });


        it("to mockVault address，appdata length= 32", async function () {
            let vaultAddress = await mockVault.getAddress();
            let appData = "55".repeat(32);
            let data=  vaultAddress.replace("0x", "") + "00" + "0001" + owner.address.replace("0x", "") +appData;
            let len = (data.length/2).toString(16);
            console.log("len", len);
            data = "0x6a" + len + data;

            await checkRetrieveAndBalances(data, amount, txid, zkRocket, zkBTC, l2t, mockVault, mockApp, owner);
        });


        it("to mockVault address，  appdata length= 33", async function () {
            let vaultAddress = await mockVault.getAddress();
            // 构造 29 bytes 的 appData，填充 0
            let appData = "55".repeat(33);
            let data=  vaultAddress.replace("0x", "") + "00" + "0001" + owner.address.replace("0x", "") +appData;
            let len = (data.length/2).toString(16);
            data = "0x6a4c" + len + data;
            await checkRetrieveAndBalances(data, amount, txid, zkRocket, zkBTC, l2t, mockVault, mockApp, owner);
        });

        it("to mockVault address，  appdata length= 212", async function () {
            let vaultAddress = await mockVault.getAddress();
            // 构造 29 bytes 的 appData，填充 0
            let appData = "55".repeat(212);
            let data=  vaultAddress.replace("0x", "") + "00" + "0001"  + owner.address.replace("0x", "") +appData;
            let len = (data.length/2).toString(16);
            data = "0x6a4c" + len + data;
            await checkRetrieveAndBalances(data, amount, txid, zkRocket, zkBTC, l2t, mockVault, mockApp, owner);
        });

        it("to mockVault address，  appdata length= 213", async function () {
            let vaultAddress = await mockVault.getAddress();
            // 构造 29 bytes 的 appData，填充 0
            let appData = "55".repeat(213);
            let data=  vaultAddress.replace("0x", "") + "00" + "0001"  + owner.address.replace("0x", "") +appData;
            let len = (data.length/2).toString(16).padStart(4, "0");;
            data = "0x6a4d" + len + data;
            await checkRetrieveAndBalances(data, amount, txid, zkRocket, zkBTC, l2t, mockVault, mockApp, owner);
        });

        it("to mockVault address，  appdata length= 214", async function () {
            let vaultAddress = await mockVault.getAddress();
            // 构造 29 bytes 的 appData，填充 0
            let appData = "55".repeat(214);
            let data=  vaultAddress.replace("0x", "") + "00" + "0001" + owner.address.replace("0x", "") +appData;
            let len = (data.length/2).toString(16).padStart(4, "0");;
            data = "0x6a4d" + len + data;

            await checkRetrieveAndBalances(data, amount, txid, zkRocket, zkBTC, l2t, mockVault, mockApp, owner);
        });

        it("to mockVault address，  appdata length= 65492", async function () {
            let vaultAddress = await mockVault.getAddress();
            // 构造 29 bytes 的 appData，填充 0
            let appData = "55".repeat(65492);
            let data=  vaultAddress.replace("0x", "") + "00" + "0001"  + owner.address.replace("0x", "") +appData;
            let len = (data.length/2).toString(16).padStart(4, "0");;
            data = "0x6a4d" + len + data;

            await checkRetrieveAndBalances(data, amount, txid, zkRocket, zkBTC, l2t, mockVault, mockApp, owner);
        });

        it("to mockVault address，  appdata length= 65493", async function () {
            let vaultAddress = await mockVault.getAddress();
            // 构造 29 bytes 的 appData，填充 0
            let appData = "55".repeat(65493);
            let data=  vaultAddress.replace("0x", "") + "00" + "0001" + owner.address.replace("0x", "") +appData;
            let len = (data.length/2).toString(16).padStart(8, "0");;
            data = "0x6a4e" + len + data;

            const provenData = {
                index: 1,
                blockHash: txid,
                associatedAmount: amount, // 10*1e8
                data: data,
                retrieved: false
            };

            await checkRetrieveAndBalances(data, amount, txid, zkRocket, zkBTC, l2t, mockVault, mockApp, owner);
        });

        it("to mockVault address，  appdata length= 65494", async function () {
            let vaultAddress = await mockVault.getAddress();
            // 构造 29 bytes 的 appData，填充 0
            let appData = "55".repeat(65494);
            let data=  vaultAddress.replace("0x", "") + "00" + "0001" + owner.address.replace("0x", "") +appData;
            let len = (data.length/2).toString(16).padStart(8, "0");;
            data = "0x6a4e" + len + data;

            await checkRetrieveAndBalances(data, amount, txid, zkRocket, zkBTC, l2t, mockVault, mockApp, owner);
        });

        it("to mockVault address，  appdata length= 132001", async function () {
            let vaultAddress = await mockVault.getAddress();
            // 构造 29 bytes 的 appData，填充 0
            let appData = "55".repeat(132001);
            let data=  vaultAddress.replace("0x", "") + "00" + "0001" + owner.address.replace("0x", "") +appData;
            let len = (data.length/2).toString(16).padStart(8, "0");
            data = "0x6a4e" + len + data;
            await checkRetrieveAndBalances(data, amount, txid, zkRocket, zkBTC, l2t, mockVault, mockApp, owner);
        });

        it("to mockApp address， appdata length= 132001", async function () {
            await zkRocket.addVault(await mockApp.getAddress());
            await zkBTC.mint(await mockApp.getAddress(), 1000n *big18);
            expect(await zkBTC.balanceOf(await mockApp.getAddress())).to.equal(1000n * big18);
            expect (await zkRocket.vaults(await mockApp.getAddress())).is.true;
            await l2t.mint(await mockApp.getAddress(), 100000n *big18);
            expect(await l2t.balanceOf(await mockApp.getAddress())).to.equal(100000n * big18);

            await mockApp.grantRole(
                await mockApp.OPERATOR_ROLE(),
                await zkRocket.getAddress()
            );

            let vaultAddress = await mockApp.getAddress();
            // 构造 29 bytes 的 appData，填充 0
            let appData = "55".repeat(132001);
            let data=  vaultAddress.replace("0x", "") + "00" + "0001" + owner.address.replace("0x", "") +appData;
            let len = (data.length/2).toString(16).padStart(8, "0");
            data = "0x6a4e" + len + data;

            const provenData = {
                index: 1,
                blockHash: txid,
                associatedAmount: amount, // 10*1e8
                data: data,
                retrieved: false
            };

            let vaultZKBTCBalanceBefore = await zkBTC.balanceOf(await mockApp.getAddress());
            expect(await zkBTC.balanceOf(await owner.address)).to.equal(0n);
            expect(await mockApp.balances(await owner.address)).to.equal(0);
            let vaultZKLITBalanceBefore = await l2t.balanceOf(await mockApp.getAddress());
            expect(vaultZKLITBalanceBefore).to.equal(100000n *big18);

            await expect(
                zkRocket.retrieve(provenData, txid)
            ).to.emit(mockApp, "Execute");

            let vaultZKBTCBalanceAfter = await zkBTC.balanceOf(await mockApp.getAddress());
            expect(vaultZKBTCBalanceBefore - vaultZKBTCBalanceAfter).to.equal(0n);
            expect(await mockApp.balances(await owner.address)).to.equal(amount);

            let vaultZKLITBalanceAfter = await l2t.balanceOf(await mockApp.getAddress());
            expect(vaultZKLITBalanceBefore).to.equal(vaultZKLITBalanceAfter);
        });

        it("to mockVault address， no protocol,  appdata length= 132001", async function () {
            let vaultAddress = await mockVault.getAddress();
            let appData = "55".repeat(132001);
            let data=  vaultAddress.replace("0x", "") + "00" + "0000" + owner.address.replace("0x", "") +appData;
            let len = (data.length/2).toString(16).padStart(8, "0");
            data = "0x6a4e" + len + data;
            const provenData = {
                index: 1,
                blockHash: txid,
                associatedAmount: amount, // 10*1e8
                data: data,
                retrieved: false
            };

            let vaultZKBTCBalanceBefore = await zkBTC.balanceOf(await mockVault.getAddress());
            expect(await zkBTC.balanceOf(await owner.address)).to.equal(0n);
            let vaultZKLITBalanceBefore = await l2t.balanceOf(await mockVault.getAddress());
            let appZKLITBalanceBefore = await l2t.balanceOf(await mockApp.getAddress());
            expect(appZKLITBalanceBefore).to.equal(0n);

            await zkRocket.retrieve(provenData, txid);


            let vaultZKBTCBalanceAfter = await zkBTC.balanceOf(await mockVault.getAddress());
            expect(vaultZKBTCBalanceBefore - vaultZKBTCBalanceAfter).to.equal(0n);
            expect(await mockVault.balances(await owner.address)).to.equal(amount);

            let vaultZKLITBalanceAfter = await l2t.balanceOf(await mockVault.getAddress());
            let appZKLITBalanceAfter = await l2t.balanceOf(await mockApp.getAddress());
            expect(vaultZKLITBalanceBefore - vaultZKLITBalanceAfter).to.equal(0n);
            expect(appZKLITBalanceAfter - appZKLITBalanceBefore).to.equal(0n);
        });



    });

    describe("register application by admin", () => {
        it("register application by admin", async function () {
            expect(await zkRocket.nextProtocolId()).to.equal(2);
            await expect(
                zkRocket.connect(owner).registerApplication(await mockApp.getAddress())
            ).to.emit(zkRocket, "ApplicationRegistered")
                .withArgs(2, await mockApp.getAddress());
            expect(await zkRocket.nextProtocolId()).to.equal(3);
            expect(await zkRocket.applications(2)).to.equal(await mockApp.getAddress());
        });

        it("register application by not admin", async function () {
            expect(await zkRocket.nextProtocolId()).to.equal(2);
            await expect(
                zkRocket.connect(user1).registerApplication(await mockApp.getAddress())
            ).to.be.revertedWith("Caller is not auction launcher or admin");
            expect(await zkRocket.nextProtocolId()).to.equal(2);
        });
    });

    describe("LIT calculation", () => {
        it("LIT calculation, totalBridgeAmount = 0", async function () {
            let totalBridgeAmount = await mockFeePool.totalBridgeAmount();
            expect(totalBridgeAmount).to.equal(0n);
            let litAmount = await zkRocket.calculateLITAmount(1n*big8);
            expect (litAmount).to.equal(128n*big18);

            litAmount = await zkRocket.calculateLITAmount(2n*big8);
            expect (litAmount).to.equal(256n*big18);

            litAmount = await zkRocket.calculateLITAmount(1);
            expect (litAmount).to.equal(128n*big10);
        });

        it("LIT calculation, totalBridgeAmount = 10254*big8-1", async function () {
            let amount = 10254n*big8-1n;
            await mockFeePool.setTotalBridgeAmount(amount);
            let totalBridgeAmount = await mockFeePool.totalBridgeAmount();
            expect(totalBridgeAmount).to.equal(amount);
            let litAmount = await zkRocket.calculateLITAmount(1n*big8);
            expect (litAmount).to.equal(128n*big18);

            litAmount = await zkRocket.calculateLITAmount(2n*big8);
            expect (litAmount).to.equal(256n*big18);

            litAmount = await zkRocket.calculateLITAmount(1);
            expect (litAmount).to.equal(128n*big10);
        });

        it("LIT calculation, totalBridgeAmount = 10254*big8", async function () {
            let amount = 10254n*big8;
            await mockFeePool.setTotalBridgeAmount(amount);
            let totalBridgeAmount = await mockFeePool.totalBridgeAmount();
            expect(totalBridgeAmount).to.equal(amount);
            let litAmount = await zkRocket.calculateLITAmount(1n*big8);
            expect (litAmount).to.equal(64n*big18);

            litAmount = await zkRocket.calculateLITAmount(2n*big8);
            expect (litAmount).to.equal(128n*big18);

            litAmount = await zkRocket.calculateLITAmount(1);
            expect (litAmount).to.equal(64n*big10);
        });

        it("LIT calculation, totalBridgeAmount = 164062*big8-1", async function () {
            let amount = 164062n*big8-1n;
            await mockFeePool.setTotalBridgeAmount(amount);
            let totalBridgeAmount = await mockFeePool.totalBridgeAmount();
            expect(totalBridgeAmount).to.equal(amount);
            let litAmount = await zkRocket.calculateLITAmount(1n*big8);
            expect (litAmount).to.equal(64n*big18);

            litAmount = await zkRocket.calculateLITAmount(2n*big8);
            expect (litAmount).to.equal(128n*big18);

            litAmount = await zkRocket.calculateLITAmount(1);
            expect (litAmount).to.equal(64n*big10);
        });

        it("LIT calculation, totalBridgeAmount = 164062*big8", async function () {
            let amount = 164062n*big8;
            await mockFeePool.setTotalBridgeAmount(amount);
            let totalBridgeAmount = await mockFeePool.totalBridgeAmount();
            expect(totalBridgeAmount).to.equal(amount);
            let litAmount = await zkRocket.calculateLITAmount(1n*big8);
            expect (litAmount).to.equal(32n*big18);

            litAmount = await zkRocket.calculateLITAmount(2n*big8);
            expect (litAmount).to.equal(64n*big18);

            litAmount = await zkRocket.calculateLITAmount(1);
            expect (litAmount).to.equal(32n*big10);
        });

        it("LIT calculation, totalBridgeAmount = 1312500*big8-1", async function () {
            let amount = 1312500n*big8-1n;
            await mockFeePool.setTotalBridgeAmount(amount);
            let totalBridgeAmount = await mockFeePool.totalBridgeAmount();
            expect(totalBridgeAmount).to.equal(amount);
            let litAmount = await zkRocket.calculateLITAmount(1n*big8);
            expect (litAmount).to.equal(32n*big18);

            litAmount = await zkRocket.calculateLITAmount(2n*big8);
            expect (litAmount).to.equal(64n*big18);

            litAmount = await zkRocket.calculateLITAmount(1);
            expect (litAmount).to.equal(32n*big10);
        });

        it("LIT calculation, totalBridgeAmount = 1312500*big8", async function () {
            let amount = 1312500n*big8;
            await mockFeePool.setTotalBridgeAmount(amount);
            let totalBridgeAmount = await mockFeePool.totalBridgeAmount();
            expect(totalBridgeAmount).to.equal(amount);
            let litAmount = await zkRocket.calculateLITAmount(1n*big8);
            expect (litAmount).to.equal(16n*big18);

            litAmount = await zkRocket.calculateLITAmount(2n*big8);
            expect (litAmount).to.equal(32n*big18);

            litAmount = await zkRocket.calculateLITAmount(1);
            expect (litAmount).to.equal(16n*big10);
        });

        it("LIT calculation, totalBridgeAmount = 2625000*big8-1", async function () {
            let amount = 2625000n*big8-1n;
            await mockFeePool.setTotalBridgeAmount(amount);
            let totalBridgeAmount = await mockFeePool.totalBridgeAmount();
            expect(totalBridgeAmount).to.equal(amount);
            let litAmount = await zkRocket.calculateLITAmount(1n*big8);
            expect (litAmount).to.equal(16n*big18);

            litAmount = await zkRocket.calculateLITAmount(2n*big8);
            expect (litAmount).to.equal(32n*big18);

            litAmount = await zkRocket.calculateLITAmount(1);
            expect (litAmount).to.equal(16n*big10);
        });

        it("LIT calculation, totalBridgeAmount = 2625000*big8", async function () {
            let amount = 2625000n*big8;
            await mockFeePool.setTotalBridgeAmount(amount);
            let totalBridgeAmount = await mockFeePool.totalBridgeAmount();
            expect(totalBridgeAmount).to.equal(amount);
            let litAmount = await zkRocket.calculateLITAmount(1n*big8);
            expect (litAmount).to.equal(8n*big18);

            litAmount = await zkRocket.calculateLITAmount(2n*big8);
            expect (litAmount).to.equal(16n*big18);

            litAmount = await zkRocket.calculateLITAmount(1);
            expect (litAmount).to.equal(8n*big10);
        });

        it("LIT calculation, totalBridgeAmount = 5250000*big8-1", async function () {
            let amount = 5250000n*big8-1n;
            await mockFeePool.setTotalBridgeAmount(amount);
            let totalBridgeAmount = await mockFeePool.totalBridgeAmount();
            expect(totalBridgeAmount).to.equal(amount);
            let litAmount = await zkRocket.calculateLITAmount(1n*big8);
            expect (litAmount).to.equal(8n*big18);

            litAmount = await zkRocket.calculateLITAmount(2n*big8);
            expect (litAmount).to.equal(16n*big18);

            litAmount = await zkRocket.calculateLITAmount(1);
            expect (litAmount).to.equal(8n*big10);
        });

        it("LIT calculation, totalBridgeAmount = 5250000*big8", async function () {
            let amount = 5250000n*big8;
            await mockFeePool.setTotalBridgeAmount(amount);
            let totalBridgeAmount = await mockFeePool.totalBridgeAmount();
            expect(totalBridgeAmount).to.equal(amount);
            let litAmount = await zkRocket.calculateLITAmount(1n*big8);
            expect (litAmount).to.equal(4n*big18);

            litAmount = await zkRocket.calculateLITAmount(2n*big8);
            expect (litAmount).to.equal(8n*big18);

            litAmount = await zkRocket.calculateLITAmount(1);
            expect (litAmount).to.equal(4n*big10);
        });

        it("LIT calculation, totalBridgeAmount = 10500000*big8-1", async function () {
            let amount = 10500000n*big8-1n;
            await mockFeePool.setTotalBridgeAmount(amount);
            let totalBridgeAmount = await mockFeePool.totalBridgeAmount();
            expect(totalBridgeAmount).to.equal(amount);
            let litAmount = await zkRocket.calculateLITAmount(1n*big8);
            expect (litAmount).to.equal(4n*big18);

            litAmount = await zkRocket.calculateLITAmount(2n*big8);
            expect (litAmount).to.equal(8n*big18);

            litAmount = await zkRocket.calculateLITAmount(1);
            expect (litAmount).to.equal(4n*big10);
        });

        it("LIT calculation, totalBridgeAmount = 10500000*big8", async function () {
            let amount = 10500000n*big8;
            await mockFeePool.setTotalBridgeAmount(amount);
            let totalBridgeAmount = await mockFeePool.totalBridgeAmount();
            expect(totalBridgeAmount).to.equal(amount);
            let litAmount = await zkRocket.calculateLITAmount(1n*big8);
            expect (litAmount).to.equal(2n*big18);

            litAmount = await zkRocket.calculateLITAmount(2n*big8);
            expect (litAmount).to.equal(4n*big18);

            litAmount = await zkRocket.calculateLITAmount(1);
            expect (litAmount).to.equal(2n*big10);
        });

        it("LIT calculation, totalBridgeAmount = 21000000*big8-1", async function () {
            let amount = 21000000n*big8-1n;
            await mockFeePool.setTotalBridgeAmount(amount);
            let totalBridgeAmount = await mockFeePool.totalBridgeAmount();
            expect(totalBridgeAmount).to.equal(amount);
            let litAmount = await zkRocket.calculateLITAmount(1n*big8);
            expect (litAmount).to.equal(2n*big18);

            litAmount = await zkRocket.calculateLITAmount(2n*big8);
            expect (litAmount).to.equal(4n*big18);

            litAmount = await zkRocket.calculateLITAmount(1);
            expect (litAmount).to.equal(2n*big10);
        });

        it("LIT calculation, totalBridgeAmount = 21000000*big8", async function () {
            let amount = 21000000n*big8;
            await mockFeePool.setTotalBridgeAmount(amount);
            let totalBridgeAmount = await mockFeePool.totalBridgeAmount();
            expect(totalBridgeAmount).to.equal(amount);
            let litAmount = await zkRocket.calculateLITAmount(1n*big8);
            expect (litAmount).to.equal(1n*big18);

            litAmount = await zkRocket.calculateLITAmount(2n*big8);
            expect (litAmount).to.equal(2n*big18);

            litAmount = await zkRocket.calculateLITAmount(1);
            expect (litAmount).to.equal(1n*big10);
        });

        it("LIT calculation, totalBridgeAmount = 42000000*big8-1", async function () {
            let amount = 42000000n*big8-1n;
            await mockFeePool.setTotalBridgeAmount(amount);
            let totalBridgeAmount = await mockFeePool.totalBridgeAmount();
            expect(totalBridgeAmount).to.equal(amount);
            let litAmount = await zkRocket.calculateLITAmount(1n*big8);
            expect (litAmount).to.equal(1n*big18);

            litAmount = await zkRocket.calculateLITAmount(2n*big8);
            expect (litAmount).to.equal(2n*big18);

            litAmount = await zkRocket.calculateLITAmount(1);
            expect (litAmount).to.equal(1n*big10);
        });

        it("LIT calculation, totalBridgeAmount = 42000000*big8", async function () {
            let amount = 42000000n*big8;
            await mockFeePool.setTotalBridgeAmount(amount);
            let totalBridgeAmount = await mockFeePool.totalBridgeAmount();
            expect(totalBridgeAmount).to.equal(amount);
            let litAmount = await zkRocket.calculateLITAmount(1n*big8);
            expect (litAmount).to.equal(0n);

            litAmount = await zkRocket.calculateLITAmount(2n*big8);
            expect (litAmount).to.equal(0n);

            litAmount = await zkRocket.calculateLITAmount(1);
            expect (litAmount).to.equal(0n);
        });


    });
});