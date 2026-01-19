const {
    time,
    loadFixture,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { expect } = require("chai");

describe("ZkRocket", function () {
    let zkBTC, l2t, zkRocket, mockApp, mockTokenomics,auction, mockVault;
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

        const MockTokenomics = await ethers.getContractFactory("MockTokenomics");
        mockTokenomics = await MockTokenomics.deploy();
        await mockTokenomics.waitForDeployment();

        const ZkRockets = await ethers.getContractFactory("ZkRockets");
        zkRocket = await ZkRockets.deploy(await zkBTC.getAddress(), await l2t.getAddress(), await mockTokenomics.getAddress());
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
        let vaultL2TBalanceBefore = await l2t.balanceOf(await mockVault.getAddress());
        let appL2TBalanceBefore = await l2t.balanceOf(await mockApp.getAddress());
        expect(appL2TBalanceBefore).to.equal(0n);

        await expect(
            zkRocket.retrieve(provenData, txid)
        ).to.emit(mockApp, "Execute");

        let zkBTCAmount = await zkRocket.calculateZKBTCAmount(amount)

        let vaultZKBTCBalanceAfter = await zkBTC.balanceOf(await mockVault.getAddress());
        expect(vaultZKBTCBalanceBefore - vaultZKBTCBalanceAfter).to.equal(0n);
        expect(await mockVault.balances(await owner.address)).to.equal(zkBTCAmount);

        let vaultL2TBalanceAfter = await l2t.balanceOf(await mockVault.getAddress());
        let appL2TBalanceAfter = await l2t.balanceOf(await mockApp.getAddress());
        expect(vaultL2TBalanceBefore - vaultL2TBalanceAfter)
            .to.equal(appL2TBalanceAfter - appL2TBalanceBefore);

        let l2tAmount = await zkRocket.calculateL2TAmount(amount);
        expect(appL2TBalanceAfter).to.equal(l2tAmount);
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
            ).to.be.revertedWith("Invalid data");
         });

        it("to MockVault address，no app data, startRound = 0", async function () {
            let vaultAddress = await mockVault.getAddress();
            let data=  vaultAddress.replace("0x", "") + "00" + "0001" + owner.address.replace("0x", "")
            let len = (data.length/2).toString(16);
            data = "0x6a" + len + data;

            await checkRetrieveAndBalances(data, amount, txid, zkRocket, zkBTC, l2t, mockVault, mockApp, owner);
        });


        it("to mockVault address，appdata length= 32, startRound = 0", async function () {
            let vaultAddress = await mockVault.getAddress();
            let appData = "55".repeat(32);
            let data=  vaultAddress.replace("0x", "") + "00" + "0001" + owner.address.replace("0x", "") +appData;
            let len = (data.length/2).toString(16);
            data = "0x6a" + len + data;

            await checkRetrieveAndBalances(data, amount, txid, zkRocket, zkBTC, l2t, mockVault, mockApp, owner);
        });


        it("to mockVault address，  appdata length= 33, startRound = 0", async function () {
            let vaultAddress = await mockVault.getAddress();
            // 构造 29 bytes 的 appData，填充 0
            let appData = "55".repeat(33);
            let data=  vaultAddress.replace("0x", "") + "00" + "0001" + owner.address.replace("0x", "") +appData;
            let len = (data.length/2).toString(16);
            data = "0x6a4c" + len + data;
            await checkRetrieveAndBalances(data, amount, txid, zkRocket, zkBTC, l2t, mockVault, mockApp, owner);
        });

        it("to mockVault address，  appdata length= 212, startRound = 0", async function () {
            let vaultAddress = await mockVault.getAddress();
            // 构造 29 bytes 的 appData，填充 0
            let appData = "55".repeat(212);
            let data=  vaultAddress.replace("0x", "") + "00" + "0001"  + owner.address.replace("0x", "") +appData;
            let len = (data.length/2).toString(16);
            data = "0x6a4c" + len + data;
            await checkRetrieveAndBalances(data, amount, txid, zkRocket, zkBTC, l2t, mockVault, mockApp, owner);
        });

        it("to mockVault address，  appdata length= 213, startRound = 0", async function () {
            let vaultAddress = await mockVault.getAddress();
            // 构造 29 bytes 的 appData，填充 0
            let appData = "55".repeat(213);
            let data=  vaultAddress.replace("0x", "") + "00" + "0001"  + owner.address.replace("0x", "") +appData;
            let len = (data.length/2).toString(16).padStart(4, "0");;
            data = "0x6a4d" + len + data;
            await checkRetrieveAndBalances(data, amount, txid, zkRocket, zkBTC, l2t, mockVault, mockApp, owner);
        });

        it("to mockVault address，  appdata length= 214, startRound = 0", async function () {
            let vaultAddress = await mockVault.getAddress();
            // 构造 29 bytes 的 appData，填充 0
            let appData = "55".repeat(214);
            let data=  vaultAddress.replace("0x", "") + "00" + "0001" + owner.address.replace("0x", "") +appData;
            let len = (data.length/2).toString(16).padStart(4, "0");;
            data = "0x6a4d" + len + data;

            await checkRetrieveAndBalances(data, amount, txid, zkRocket, zkBTC, l2t, mockVault, mockApp, owner);
        });

        it("to mockVault address，  appdata length= 65492, startRound = 0", async function () {
            let vaultAddress = await mockVault.getAddress();
            // 构造 29 bytes 的 appData，填充 0
            let appData = "55".repeat(65492);
            let data=  vaultAddress.replace("0x", "") + "00" + "0001"  + owner.address.replace("0x", "") +appData;
            let len = (data.length/2).toString(16).padStart(4, "0");;
            data = "0x6a4d" + len + data;

            await checkRetrieveAndBalances(data, amount, txid, zkRocket, zkBTC, l2t, mockVault, mockApp, owner);
        });

        it("to mockVault address，  appdata length= 65493, startRound = 0", async function () {
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

        it("to mockVault address，  appdata length= 65494, startRound = 0", async function () {
            let vaultAddress = await mockVault.getAddress();
            // 构造 29 bytes 的 appData，填充 0
            let appData = "55".repeat(65494);
            let data=  vaultAddress.replace("0x", "") + "00" + "0001" + owner.address.replace("0x", "") +appData;
            let len = (data.length/2).toString(16).padStart(8, "0");;
            data = "0x6a4e" + len + data;

            await checkRetrieveAndBalances(data, amount, txid, zkRocket, zkBTC, l2t, mockVault, mockApp, owner);
        });

        it("to mockVault address，  appdata length= 132001, startRound = 0", async function () {
            let vaultAddress = await mockVault.getAddress();
            // 构造 29 bytes 的 appData，填充 0
            let appData = "55".repeat(132001);
            let data=  vaultAddress.replace("0x", "") + "00" + "0001" + owner.address.replace("0x", "") +appData;
            let len = (data.length/2).toString(16).padStart(8, "0");
            data = "0x6a4e" + len + data;
            await checkRetrieveAndBalances(data, amount, txid, zkRocket, zkBTC, l2t, mockVault, mockApp, owner);
        });

        it("to mockApp address， appdata length= 132001, startRound = 0", async function () {
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
            let vaultL2TBalanceBefore = await l2t.balanceOf(await mockApp.getAddress());
            expect(vaultL2TBalanceBefore).to.equal(100000n *big18);

            await expect(
                zkRocket.retrieve(provenData, txid)
            ).to.emit(mockApp, "Execute");

            let zkBTCAmount = await zkRocket.calculateZKBTCAmount(amount);

            let vaultZKBTCBalanceAfter = await zkBTC.balanceOf(await mockApp.getAddress());
            expect(vaultZKBTCBalanceBefore - vaultZKBTCBalanceAfter).to.equal(0n);
            expect(await mockApp.balances(await owner.address)).to.equal(zkBTCAmount);

            let vaultL2TBalanceAfter = await l2t.balanceOf(await mockApp.getAddress());
            expect(vaultL2TBalanceBefore).to.equal(vaultL2TBalanceAfter);
        });

        it("to vault address not belong to zkRocket and App， appdata length= 132001", async function () {
            let vaultAddress = await user2.address;
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

            let vaultZKBTCBalanceBefore = await zkBTC.balanceOf(await mockVault.getAddress());
            expect(await zkBTC.balanceOf(await owner.address)).to.equal(0n);
            let vaultL2TBalanceBefore = await l2t.balanceOf(await mockVault.getAddress());

            await expect(
                zkRocket.retrieve(provenData, txid)
            ).to.emit(mockApp, "Execute");

            let vaultZKBTCBalanceAfter = await zkBTC.balanceOf(await mockVault.getAddress());
            expect(vaultZKBTCBalanceBefore - vaultZKBTCBalanceAfter).to.equal(0n);
            expect(await mockVault.balances(await owner.address)).to.equal(0);

            let vaultL2TBalanceAfter = await l2t.balanceOf(await mockVault.getAddress());
            expect(vaultL2TBalanceBefore - vaultL2TBalanceAfter).to.equal(0n);
        });

        it("to vault address not belong to zkRocket and App， unregistered protocolId, appdata length= 132001", async function () {
            let vaultAddress = await user2.address;
            // 构造 29 bytes 的 appData，填充 0
            let appData = "55".repeat(132001);
            let data=  vaultAddress.replace("0x", "") + "00" + "FFFF" + owner.address.replace("0x", "") +appData;
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
            let vaultL2TBalanceBefore = await l2t.balanceOf(await mockVault.getAddress());

            await expect(
                zkRocket.retrieve(provenData, txid)
            ).to.not.be.reverted

            let vaultZKBTCBalanceAfter = await zkBTC.balanceOf(await mockVault.getAddress());
            expect(vaultZKBTCBalanceBefore - vaultZKBTCBalanceAfter).to.equal(0n);
            expect(await mockVault.balances(await owner.address)).to.equal(0);

            let vaultL2TBalanceAfter = await l2t.balanceOf(await mockVault.getAddress());
            expect(vaultL2TBalanceBefore - vaultL2TBalanceAfter).to.equal(0n);
        });


        it("to mockVault address， unregistered protocolId,  appdata length= 132001", async function () {
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
            let vaultL2TBalanceBefore = await l2t.balanceOf(await mockVault.getAddress());
            let appL2TBalanceBefore = await l2t.balanceOf(await mockApp.getAddress());
            expect(appL2TBalanceBefore).to.equal(0n);

            await zkRocket.retrieve(provenData, txid);

            let zkBTCAmount = await zkRocket.calculateZKBTCAmount(amount);

            let vaultZKBTCBalanceAfter = await zkBTC.balanceOf(await mockVault.getAddress());
            expect(vaultZKBTCBalanceBefore - vaultZKBTCBalanceAfter).to.equal(0n);
            expect(await mockVault.balances(await owner.address)).to.equal(zkBTCAmount);

            let vaultL2TBalanceAfter = await l2t.balanceOf(await mockVault.getAddress());
            let appL2TBalanceAfter = await l2t.balanceOf(await mockApp.getAddress());
            expect(vaultL2TBalanceBefore - vaultL2TBalanceAfter).to.equal(0n);
            expect(appL2TBalanceAfter - appL2TBalanceBefore).to.equal(0n);
        });

        it("to MockVault address，no app data, startRound = 1", async function () {
            await mockTokenomics.setStartRound(1);
            let round = await mockTokenomics.startRound();
            expect(round).to.equal(1);

            let vaultAddress = await mockVault.getAddress();
            let data=  vaultAddress.replace("0x", "") + "00" + "0001" + owner.address.replace("0x", "")
            let len = (data.length/2).toString(16);
            data = "0x6a" + len + data;
            await checkRetrieveAndBalances(data, amount, txid, zkRocket, zkBTC, l2t, mockVault, mockApp, owner);
        });

        it("to MockVault address，no app data, startRound = 2", async function () {
            await mockTokenomics.setStartRound(2);
            let round = await mockTokenomics.startRound();
            expect(round).to.equal(2);

            let vaultAddress = await mockVault.getAddress();
            let data=  vaultAddress.replace("0x", "") + "00" + "0001" + owner.address.replace("0x", "")
            let len = (data.length/2).toString(16);
            data = "0x6a" + len + data;
            await checkRetrieveAndBalances(data, amount, txid, zkRocket, zkBTC, l2t, mockVault, mockApp, owner);
        });

        it("to MockVault address，no app data, startRound = 3", async function () {
            await mockTokenomics.setStartRound(3);
            let round = await mockTokenomics.startRound();
            expect(round).to.equal(3);

            let vaultAddress = await mockVault.getAddress();
            let data=  vaultAddress.replace("0x", "") + "00" + "0001" + owner.address.replace("0x", "")
            let len = (data.length/2).toString(16);
            data = "0x6a" + len + data;
            await checkRetrieveAndBalances(data, amount, txid, zkRocket, zkBTC, l2t, mockVault, mockApp, owner);
        });

        it("to MockVault address，no app data, startRound = 4", async function () {
            await mockTokenomics.setStartRound(4);
            let round = await mockTokenomics.startRound();
            expect(round).to.equal(4);

            let vaultAddress = await mockVault.getAddress();
            let data=  vaultAddress.replace("0x", "") + "00" + "0001" + owner.address.replace("0x", "")
            let len = (data.length/2).toString(16);
            data = "0x6a" + len + data;
            await checkRetrieveAndBalances(data, amount, txid, zkRocket, zkBTC, l2t, mockVault, mockApp, owner);
        });

        it("to MockVault address，no app data, startRound = 5", async function () {
            await mockTokenomics.setStartRound(5);
            let round = await mockTokenomics.startRound();
            expect(round).to.equal(5);

            let vaultAddress = await mockVault.getAddress();
            let data=  vaultAddress.replace("0x", "") + "00" + "0001" + owner.address.replace("0x", "")
            let len = (data.length/2).toString(16);
            data = "0x6a" + len + data;
            await checkRetrieveAndBalances(data, amount, txid, zkRocket, zkBTC, l2t, mockVault, mockApp, owner);
        });

        it("to MockVault address，no app data, startRound = 6", async function () {
            await mockTokenomics.setStartRound(6);
            let round = await mockTokenomics.startRound();
            expect(round).to.equal(6);

            let vaultAddress = await mockVault.getAddress();
            let data=  vaultAddress.replace("0x", "") + "00" + "0001" + owner.address.replace("0x", "")
            let len = (data.length/2).toString(16);
            data = "0x6a" + len + data;
            await checkRetrieveAndBalances(data, amount, txid, zkRocket, zkBTC, l2t, mockVault, mockApp, owner);
        });

        it("to MockVault address，no app data, startRound = 7", async function () {
            await mockTokenomics.setStartRound(7);
            let round = await mockTokenomics.startRound();
            expect(round).to.equal(7);

            let vaultAddress = await mockVault.getAddress();
            let data=  vaultAddress.replace("0x", "") + "00" + "0001" + owner.address.replace("0x", "")
            let len = (data.length/2).toString(16);
            data = "0x6a" + len + data;
            await checkRetrieveAndBalances(data, amount, txid, zkRocket, zkBTC, l2t, mockVault, mockApp, owner);
        });

        it("to MockVault address，no app data, startRound = 8", async function () {
            await mockTokenomics.setStartRound(8);
            let round = await mockTokenomics.startRound();
            expect(round).to.equal(8);

            let vaultAddress = await mockVault.getAddress();
            let data=  vaultAddress.replace("0x", "") + "00" + "0001" + owner.address.replace("0x", "")
            let len = (data.length/2).toString(16);
            data = "0x6a" + len + data;
            await checkRetrieveAndBalances(data, amount, txid, zkRocket, zkBTC, l2t, mockVault, mockApp, owner);
        });

        it("to MockVault address，no app data, startRound = 9", async function () {
            await mockTokenomics.setStartRound(9);
            let round = await mockTokenomics.startRound();
            expect(round).to.equal(9);

            let vaultAddress = await mockVault.getAddress();
            let data=  vaultAddress.replace("0x", "") + "00" + "0001" + owner.address.replace("0x", "")
            let len = (data.length/2).toString(16);
            data = "0x6a" + len + data;
            await checkRetrieveAndBalances(data, amount, txid, zkRocket, zkBTC, l2t, mockVault, mockApp, owner);
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

    describe("L2T calculation", () => {
        it("L2T calculation, round = 0", async function () {
            let round = await mockTokenomics.startRound();
            expect(round).to.equal(0);

            let l2tAmount = await zkRocket.calculateL2TAmount(1n*big8);
            expect (l2tAmount).to.equal(128n*big18*9n/10n);

            l2tAmount = await zkRocket.calculateL2TAmount(2n*big8);
            expect (l2tAmount).to.equal(256n*big18*9n/10n);

            l2tAmount = await zkRocket.calculateL2TAmount(1);
            expect (l2tAmount).to.equal(128n*big10*9n/10n);
        });

        it("L2T calculation, round = 1", async function () {
            await mockTokenomics.setStartRound(1);
            let round = await mockTokenomics.startRound();
            expect(round).to.equal(1);

            let l2tAmount = await zkRocket.calculateL2TAmount(1n*big8);
            expect (l2tAmount).to.equal(64n*big18*9n/10n);

            l2tAmount = await zkRocket.calculateL2TAmount(2n*big8);
            expect (l2tAmount).to.equal(128n*big18*9n/10n);

            l2tAmount = await zkRocket.calculateL2TAmount(1);
            expect (l2tAmount).to.equal(64n*big10*9n/10n);
        });

        it("L2T calculation, round = 2", async function () {
            await mockTokenomics.setStartRound(2);
            let round = await mockTokenomics.startRound();
            expect(round).to.equal(2);

            let l2tAmount = await zkRocket.calculateL2TAmount(1n*big8);
            expect (l2tAmount).to.equal(32n*big18*9n/10n);

            l2tAmount = await zkRocket.calculateL2TAmount(2n*big8);
            expect (l2tAmount).to.equal(64n*big18*9n/10n);

            l2tAmount = await zkRocket.calculateL2TAmount(1);
            expect (l2tAmount).to.equal(32n*big10*9n/10n);
        });

        it("L2T calculation, round = 3", async function () {
            await mockTokenomics.setStartRound(3);
            let round = await mockTokenomics.startRound();
            expect(round).to.equal(3);

            let l2tAmount = await zkRocket.calculateL2TAmount(1n*big8);
            expect (l2tAmount).to.equal(16n*big18*9n/10n);

            l2tAmount = await zkRocket.calculateL2TAmount(2n*big8);
            expect (l2tAmount).to.equal(32n*big18*9n/10n);

            l2tAmount = await zkRocket.calculateL2TAmount(1);
            expect (l2tAmount).to.equal(16n*big10*9n/10n);
        });

        it("L2T calculation, round = 4", async function () {
            await mockTokenomics.setStartRound(4);
            let round = await mockTokenomics.startRound();
            expect(round).to.equal(4);

            let l2tAmount = await zkRocket.calculateL2TAmount(1n*big8);
            expect (l2tAmount).to.equal(8n*big18*9n/10n);

            l2tAmount = await zkRocket.calculateL2TAmount(2n*big8);
            expect (l2tAmount).to.equal(16n*big18*9n/10n);

            l2tAmount = await zkRocket.calculateL2TAmount(1);
            expect (l2tAmount).to.equal(8n*big10*9n/10n);
        });

        it("L2T calculation, round = 5", async function () {
            await mockTokenomics.setStartRound(5);
            let round = await mockTokenomics.startRound();
            expect(round).to.equal(5);

            let l2tAmount = await zkRocket.calculateL2TAmount(1n*big8);
            expect (l2tAmount).to.equal(4n*big18*9n/10n);

            l2tAmount = await zkRocket.calculateL2TAmount(2n*big8);
            expect (l2tAmount).to.equal(8n*big18*9n/10n);

            l2tAmount = await zkRocket.calculateL2TAmount(1);
            expect (l2tAmount).to.equal(4n*big10*9n/10n);
        });

        it("L2T calculation, round = 6", async function () {
            await mockTokenomics.setStartRound(6);
            let round = await mockTokenomics.startRound();
            expect(round).to.equal(6);

            let l2tAmount = await zkRocket.calculateL2TAmount(1n*big8);
            expect (l2tAmount).to.equal(2n*big18*9n/10n);

            l2tAmount = await zkRocket.calculateL2TAmount(2n*big8);
            expect (l2tAmount).to.equal(4n*big18*9n/10n);

            l2tAmount = await zkRocket.calculateL2TAmount(1);
            expect (l2tAmount).to.equal(2n*big10*9n/10n);
        });

        it("L2T calculation, round = 7", async function () {
            await mockTokenomics.setStartRound(7);
            let round = await mockTokenomics.startRound();
            expect(round).to.equal(7);

            let l2tAmount = await zkRocket.calculateL2TAmount(1n*big8);
            expect (l2tAmount).to.equal(1n*big18*9n/10n);

            l2tAmount = await zkRocket.calculateL2TAmount(2n*big8);
            expect (l2tAmount).to.equal(2n*big18*9n/10n);

            l2tAmount = await zkRocket.calculateL2TAmount(1);
            expect (l2tAmount).to.equal(1n*big10*9n/10n);
        });
    });

    describe("zkBTC calculation", () => {
        it("zkBTC calculation, round = 0~6", async function () {
           for (let i = 0; i < 7; i++) {
                await mockTokenomics.setStartRound(i);
                let round = await mockTokenomics.startRound();
                expect(round).to.equal(i);

                let bigAmount = await zkRocket.calculateZKBTCAmount(10n * big8);
                expect(bigAmount).to.equal(999200000n);
                let smallAmount = await zkRocket.calculateZKBTCAmount(1n * big8);
                expect(smallAmount).to.equal(99720000);
            }
        });

        it("zkBTC calculation, round = 7", async function () {
                let i = 7;
                await mockTokenomics.setStartRound(i);
                let round = await mockTokenomics.startRound();
                expect(round).to.equal(i);

                let bigAmount = await zkRocket.calculateZKBTCAmount(10n * big8);
                expect(bigAmount).to.equal(999600000n);
                let smallAmount = await zkRocket.calculateZKBTCAmount(1n * big8);
                expect(smallAmount).to.equal(99860000);

        });


        it("zkBTC calculation, round = 8", async function () {
            let i = 8;
            await mockTokenomics.setStartRound(i);
            let round = await mockTokenomics.startRound();
            expect(round).to.equal(i);

            let bigAmount = await zkRocket.calculateZKBTCAmount(10n * big8);
            expect(bigAmount).to.equal(999800000n);
            let smallAmount = await zkRocket.calculateZKBTCAmount(1n * big8);
            expect(smallAmount).to.equal(99930000n);

        });

        it("zkBTC calculation, round = 9", async function () {
            let i = 9;
            await mockTokenomics.setStartRound(i);
            let round = await mockTokenomics.startRound();
            expect(round).to.equal(i);

            let bigAmount = await zkRocket.calculateZKBTCAmount(10n * big8);
            expect(bigAmount).to.equal(999900000n);
            let smallAmount = await zkRocket.calculateZKBTCAmount(1n * big8);
            expect(smallAmount).to.equal(99970000n);

        });

    });


    describe("build testdata", () => {
        const txid = "0x82c68e42a344925588d5485ca1d910ea3e1f381dc9e9735d14e6574a7fc0518c";
        const blockHash = "0x7ee2067f1b78df78daf9ae65248651d4e75585db2c1c880312d4919dc2d683d2";
        const amount = 1n * big8;
        const externalAddr = "0x6Ee0a1f264d6690Fa6DeC24ADb78AC291dF33d74"
        const ownerAddr = externalAddr
        const vaultAddr = "0xBa633eE041e1854bF42A69578028b247d180583D"
        const appAddr = "0x131d73C228BfA36F81f15D3052E0a723427494b0"

        it("transfer to user data, no app data = 0", async function () {
            let data = "0x6a14" + externalAddr.replace("0x", "")
            const provenData = {
                index: 1,
                blockHash: txid,
                associatedAmount: amount, // 10 * 1e8
                data: data,
                retrieved: false
            };
            console.log("provenData", provenData);
        });

        it("to mockVault address，participate another app, no app data, will transfer L2T ", async function () {
            let data=  vaultAddr.replace("0x", "") + "00" + "0001" + ownerAddr.replace("0x", "");
            let len = (data.length/2).toString(16);
            console.log("len", len);
            data = "0x6a" + len + data;

            const provenData = {
                index: 1,
                blockHash: txid,
                associatedAmount: amount, // 10 * 1e8
                data: data,
                retrieved: false
            };
            console.log("provenData", provenData);
        });

        it("to mockApp address，no app data, call mockApp directly", async function () {
            let data=  appAddr.replace("0x", "") + "00" + "0001" + ownerAddr.replace("0x", "");
            let len = (data.length/2).toString(16);
            console.log("len", len);
            data = "0x6a" + len + data;

            const provenData = {
                index: 1,
                blockHash: txid,
                associatedAmount: amount, // 10 * 1e8
                data: data,
                retrieved: false
            };
            console.log("provenData", provenData);
        });

        it("to mockApp address，mockApp is also zkRocket's vault, no app data", async function () {
            let data=  "0x891bA1E6c999333f8245BA275d61F391439E37B4".replace("0x", "") + "00" + "0003" + ownerAddr.replace("0x", "");
            let len = (data.length/2).toString(16);
            console.log("len", len);
            data = "0x6a" + len + data;

            const provenData = {
                index: 1,
                blockHash: txid,
                associatedAmount: amount, // 10 * 1e8
                data: data,
                retrieved: false
            };
            console.log("provenData", provenData);
        });

    });
});