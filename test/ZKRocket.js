const {
    time,
    loadFixture,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { expect } = require("chai");

describe("ZkRocket", function () {
    let zkbtc, zkRocket, mockApp, auction, vault;
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

        const Vault = await ethers.getContractFactory("Vault");
        vault = await Vault.deploy([await zkbtc.getAddress()]);
        await vault.waitForDeployment();

        await zkRocket.addVault(await vault.getAddress());
        await zkbtc.mint(await vault.getAddress(), 1000n *big18);
        expect(await zkbtc.balanceOf(await vault.getAddress())).to.equal(1000n * big18);
        expect (await zkRocket.vaults(await vault.getAddress())).is.true;

        await vault.grantRole(
            await vault.OPERATOR_ROLE(),
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

        await zkbtc.mint(user1.address, MIN_PRICE * 2n);
        await zkbtc.connect(user1).approve(await auction.getAddress(), MIN_PRICE * 2n);

        const protocolAddr = await mockApp.getAddress();
        let bidPrice = await auction.getCurrentPrice() + 10n;

        await auction.connect(user1).bid(protocolAddr, bidPrice);
    }

    beforeEach(async function (){
        await loadFixture(deployContracts);
    });

    /*
    * 测试数据
txid: 0x82c68e42a344925588d5485ca1d910ea3e1f381dc9e9735d14e6574a7fc0518c

//zkBTC 直接到 user address
[1, "0x7ee2067f1b78df78daf9ae65248651d4e75585db2c1c880312d4919dc2d683d2", 10000000000000000000, "0x6a14dD870fA1b7C4700F2BD7f44238821C26f7392148", false]

//zkRocket control's vaultAddress, protocolId = 1, userWithdraw=true, no application data
[1, "0x7ee2067f1b78df78daf9ae65248651d4e75585db2c1c880312d4919dc2d683d2", 10000000000000000000, "0x6a2c43D218197E8c5FBC0527769821503660861c704500000101dD870fA1b7C4700F2BD7f44238821C26f7392148", false]

//zkRocket control's vaultAddress, protocolId = 1, userWithdraw=false, no application data
[1, "0x7ee2067f1b78df78daf9ae65248651d4e75585db2c1c880312d4919dc2d683d2", 10000000000000000000, "0x6a2c3c725134d74D5c45B4E4ABd2e5e2a109b554128800000100dD870fA1b7C4700F2BD7f44238821C26f7392148", false]

//Not zkRocket control's vaultAddress, protocolId = 1, userWithdraw=false, no application data
[1, "0x7ee2067f1b78df78daf9ae65248651d4e75585db2c1c880312d4919dc2d683d2", 10000000000000000000, "0x6a2c3c725134d74D5c45B4E4ABd2e5e2a109b554128800000100dD870fA1b7C4700F2BD7f44238821C26f7392148", false]


    *
    * */
    describe("retrieve", function () {
        const txid = "0x82c68e42a344925588d5485ca1d910ea3e1f381dc9e9735d14e6574a7fc0518c";
        const blockHash = "0x7ee2067f1b78df78daf9ae65248651d4e75585db2c1c880312d4919dc2d683d2";
        const amount = 10n * big18;

        it("to user address", async function () {
            let data = "0x6a14" + owner.address.replace("0x", "")
            const provenData = {
                index: 1,
                blockHash: txid,
                associatedAmount: amount, // 10 * 1e18
                data: data,
                retrieved: false
            };

            await expect(
                zkRocket.retrieve(provenData, txid)
            ).to.not.be.reverted;
         });

        it("to vault address， user withdraw， no app data", async function () {
            let vaultAddress = await vault.getAddress();
            let data=  vaultAddress.replace("0x", "") + "00" + "0001" + "01" + owner.address.replace("0x", "")
            let len = (data.length/2).toString(16);
            data = "0x6a" + len + data;

            const provenData = {
                index: 1,
                blockHash: txid,
                associatedAmount: amount, // 10 * 1e18
                data: data,
                retrieved: false
            };

            let balanceBefore = await zkbtc.balanceOf(await vault.getAddress());
            expect(await zkbtc.balanceOf(await owner.address)).to.equal(0n);

            await expect(
                zkRocket.retrieve(provenData, txid)
            ).to.emit(mockApp, "Execute");

            let balanceAfter = await zkbtc.balanceOf(await vault.getAddress());
            expect(balanceBefore - balanceAfter).to.equal(amount);
            expect(await zkbtc.balanceOf(await owner.address)).to.equal(amount);

        });

        it("to vault address， user not withdraw， no app data", async function () {
            let vaultAddress = await vault.getAddress();
            let data=  vaultAddress.replace("0x", "") + "00" + "0001" + "00" + owner.address.replace("0x", "")
            let len = (data.length/2).toString(16);
            data = "0x6a" + len + data;

            const provenData = {
                index: 1,
                blockHash: txid,
                associatedAmount: amount, // 10 * 1e18
                data: data,
                retrieved: false
            };

            let balanceBefore = await zkbtc.balanceOf(await vault.getAddress());
            expect(await zkbtc.balanceOf(await owner.address)).to.equal(0n);

            await expect(
                zkRocket.retrieve(provenData, txid)
            ).to.emit(mockApp, "Execute");

            let balanceAfter = await zkbtc.balanceOf(await vault.getAddress());
            expect(balanceBefore - balanceAfter).to.equal(0n);
            expect(await vault.balances(await zkbtc.getAddress(), owner.address)).to.equal(amount);
        });

        it("to vault address， user not withdraw， appdata length= 31", async function () {
            let vaultAddress = await vault.getAddress();
            // 构造 29 bytes 的 appData，填充 0
            let appData = "55".repeat(31);
            let data=  vaultAddress.replace("0x", "") + "00" + "0001" + "00" + owner.address.replace("0x", "") +appData;
            let len = (data.length/2).toString(16);
            data = "0x6a" + len + data;

            const provenData = {
                index: 1,
                blockHash: txid,
                associatedAmount: amount, // 10 * 1e18
                data: data,
                retrieved: false
            };

            let balanceBefore = await zkbtc.balanceOf(await vault.getAddress());
            expect(await zkbtc.balanceOf(await owner.address)).to.equal(0n);

            await expect(
                zkRocket.retrieve(provenData, txid)
            ).to.emit(mockApp, "Execute");

            let balanceAfter = await zkbtc.balanceOf(await vault.getAddress());
            expect(balanceBefore - balanceAfter).to.equal(0n);
            expect(await vault.balances(await zkbtc.getAddress(), owner.address)).to.equal(amount);
        });

        it("to vault address， user not withdraw， appdata length= 32", async function () {
            let vaultAddress = await vault.getAddress();
            // 构造 29 bytes 的 appData，填充 0
            let appData = "55".repeat(32);
            let data=  vaultAddress.replace("0x", "") + "00" + "0001" + "00" + owner.address.replace("0x", "") +appData;
            let len = (data.length/2).toString(16);
            data = "0x6a4c" + len + data;

            const provenData = {
                index: 1,
                blockHash: txid,
                associatedAmount: amount, // 10 * 1e18
                data: data,
                retrieved: false
            };

            let balanceBefore = await zkbtc.balanceOf(await vault.getAddress());
            expect(await zkbtc.balanceOf(await owner.address)).to.equal(0n);

            await expect(
                zkRocket.retrieve(provenData, txid)
            ).to.emit(mockApp, "Execute");

            let balanceAfter = await zkbtc.balanceOf(await vault.getAddress());
            expect(balanceBefore - balanceAfter).to.equal(0n);
            expect(await vault.balances(await zkbtc.getAddress(), owner.address)).to.equal(amount);
        });

        it("to vault address， user not withdraw， appdata length= 211", async function () {
            let vaultAddress = await vault.getAddress();
            // 构造 29 bytes 的 appData，填充 0
            let appData = "55".repeat(211);
            let data=  vaultAddress.replace("0x", "") + "00" + "0001" + "00" + owner.address.replace("0x", "") +appData;
            let len = (data.length/2).toString(16);
            data = "0x6a4c" + len + data;

            const provenData = {
                index: 1,
                blockHash: txid,
                associatedAmount: amount, // 10 * 1e18
                data: data,
                retrieved: false
            };

            let balanceBefore = await zkbtc.balanceOf(await vault.getAddress());
            expect(await zkbtc.balanceOf(await owner.address)).to.equal(0n);

            await expect(
                zkRocket.retrieve(provenData, txid)
            ).to.emit(mockApp, "Execute");

            let balanceAfter = await zkbtc.balanceOf(await vault.getAddress());
            expect(balanceBefore - balanceAfter).to.equal(0n);
            expect(await vault.balances(await zkbtc.getAddress(), owner.address)).to.equal(amount);
        });

        it("to vault address， user not withdraw， appdata length= 212", async function () {
            let vaultAddress = await vault.getAddress();
            // 构造 29 bytes 的 appData，填充 0
            let appData = "55".repeat(212);
            let data=  vaultAddress.replace("0x", "") + "00" + "0001" + "00" + owner.address.replace("0x", "") +appData;
            let len = (data.length/2).toString(16).padStart(4, "0");;
            data = "0x6a4d" + len + data;

            const provenData = {
                index: 1,
                blockHash: txid,
                associatedAmount: amount, // 10 * 1e18
                data: data,
                retrieved: false
            };

            let balanceBefore = await zkbtc.balanceOf(await vault.getAddress());
            expect(await zkbtc.balanceOf(await owner.address)).to.equal(0n);

            await expect(
                zkRocket.retrieve(provenData, txid)
            ).to.emit(mockApp, "Execute");

            let balanceAfter = await zkbtc.balanceOf(await vault.getAddress());
            expect(balanceBefore - balanceAfter).to.equal(0n);
            expect(await vault.balances(await zkbtc.getAddress(), owner.address)).to.equal(amount);
        });

        it("to vault address， user not withdraw， appdata length= 213", async function () {
            let vaultAddress = await vault.getAddress();
            // 构造 29 bytes 的 appData，填充 0
            let appData = "55".repeat(213);
            let data=  vaultAddress.replace("0x", "") + "00" + "0001" + "00" + owner.address.replace("0x", "") +appData;
            let len = (data.length/2).toString(16).padStart(4, "0");;
            data = "0x6a4d" + len + data;

            const provenData = {
                index: 1,
                blockHash: txid,
                associatedAmount: amount, // 10 * 1e18
                data: data,
                retrieved: false
            };

            let balanceBefore = await zkbtc.balanceOf(await vault.getAddress());
            expect(await zkbtc.balanceOf(await owner.address)).to.equal(0n);

            await expect(
                zkRocket.retrieve(provenData, txid)
            ).to.emit(mockApp, "Execute");

            let balanceAfter = await zkbtc.balanceOf(await vault.getAddress());
            expect(balanceBefore - balanceAfter).to.equal(0n);
            expect(await vault.balances(await zkbtc.getAddress(), owner.address)).to.equal(amount);
        });

        it("to vault address， user not withdraw， appdata length= 65491", async function () {
            let vaultAddress = await vault.getAddress();
            // 构造 29 bytes 的 appData，填充 0
            let appData = "55".repeat(65491);
            let data=  vaultAddress.replace("0x", "") + "00" + "0001" + "00" + owner.address.replace("0x", "") +appData;
            let len = (data.length/2).toString(16).padStart(4, "0");;
            data = "0x6a4d" + len + data;

            const provenData = {
                index: 1,
                blockHash: txid,
                associatedAmount: amount, // 10 * 1e18
                data: data,
                retrieved: false
            };

            let balanceBefore = await zkbtc.balanceOf(await vault.getAddress());
            expect(await zkbtc.balanceOf(await owner.address)).to.equal(0n);

            await expect(
                zkRocket.retrieve(provenData, txid)
            ).to.emit(mockApp, "Execute");

            let balanceAfter = await zkbtc.balanceOf(await vault.getAddress());
            expect(balanceBefore - balanceAfter).to.equal(0n);
            expect(await vault.balances(await zkbtc.getAddress(), owner.address)).to.equal(amount);
        });

        it("to vault address， user not withdraw， appdata length= 65492", async function () {
            let vaultAddress = await vault.getAddress();
            // 构造 29 bytes 的 appData，填充 0
            let appData = "55".repeat(65492);
            let data=  vaultAddress.replace("0x", "") + "00" + "0001" + "00" + owner.address.replace("0x", "") +appData;
            let len = (data.length/2).toString(16).padStart(8, "0");;
            data = "0x6a4e" + len + data;

            const provenData = {
                index: 1,
                blockHash: txid,
                associatedAmount: amount, // 10 * 1e18
                data: data,
                retrieved: false
            };

            let balanceBefore = await zkbtc.balanceOf(await vault.getAddress());
            expect(await zkbtc.balanceOf(await owner.address)).to.equal(0n);

            await expect(
                zkRocket.retrieve(provenData, txid)
            ).to.emit(mockApp, "Execute");

            let balanceAfter = await zkbtc.balanceOf(await vault.getAddress());
            expect(balanceBefore - balanceAfter).to.equal(0n);
            expect(await vault.balances(await zkbtc.getAddress(), owner.address)).to.equal(amount);
        });

        it("to vault address， user not withdraw， appdata length= 65493", async function () {
            let vaultAddress = await vault.getAddress();
            // 构造 29 bytes 的 appData，填充 0
            let appData = "55".repeat(65493);
            let data=  vaultAddress.replace("0x", "") + "00" + "0001" + "00" + owner.address.replace("0x", "") +appData;
            let len = (data.length/2).toString(16).padStart(8, "0");;
            data = "0x6a4e" + len + data;

            const provenData = {
                index: 1,
                blockHash: txid,
                associatedAmount: amount, // 10 * 1e18
                data: data,
                retrieved: false
            };

            let balanceBefore = await zkbtc.balanceOf(await vault.getAddress());
            expect(await zkbtc.balanceOf(await owner.address)).to.equal(0n);

            await expect(
                zkRocket.retrieve(provenData, txid)
            ).to.emit(mockApp, "Execute");

            let balanceAfter = await zkbtc.balanceOf(await vault.getAddress());
            expect(balanceBefore - balanceAfter).to.equal(0n);
            expect(await vault.balances(await zkbtc.getAddress(), owner.address)).to.equal(amount);
        });

        it("to vault address， user not withdraw， appdata length= 132000", async function () {
            let vaultAddress = await vault.getAddress();
            // 构造 29 bytes 的 appData，填充 0
            let appData = "55".repeat(132000);
            let data=  vaultAddress.replace("0x", "") + "00" + "0001" + "00" + owner.address.replace("0x", "") +appData;
            let len = (data.length/2).toString(16).padStart(8, "0");;
            data = "0x6a4e" + len + data;

            const provenData = {
                index: 1,
                blockHash: txid,
                associatedAmount: amount, // 10 * 1e18
                data: data,
                retrieved: false
            };

            let balanceBefore = await zkbtc.balanceOf(await vault.getAddress());
            expect(await zkbtc.balanceOf(await owner.address)).to.equal(0n);

            await expect(
                zkRocket.retrieve(provenData, txid)
            ).to.emit(mockApp, "Execute");

            let balanceAfter = await zkbtc.balanceOf(await vault.getAddress());
            expect(balanceBefore - balanceAfter).to.equal(0n);
            expect(await vault.balances(await zkbtc.getAddress(), owner.address)).to.equal(amount);
        });

        it("to vault address， no protocol, user not withdraw， appdata length= 132000", async function () {
            let vaultAddress = await vault.getAddress();
            // 构造 29 bytes 的 appData，填充 0
            let appData = "55".repeat(132000);
            let data=  vaultAddress.replace("0x", "") + "00" + "0000" + "00" + owner.address.replace("0x", "") +appData;
            let len = (data.length/2).toString(16).padStart(8, "0");;
            data = "0x6a4e" + len + data;

            const provenData = {
                index: 1,
                blockHash: txid,
                associatedAmount: amount, // 10 * 1e18
                data: data,
                retrieved: false
            };

            let balanceBefore = await zkbtc.balanceOf(await vault.getAddress());
            expect(await zkbtc.balanceOf(await owner.address)).to.equal(0n);

            await expect(
                zkRocket.retrieve(provenData, txid)
            ).to.not.emit(mockApp, "Execute");

            let balanceAfter = await zkbtc.balanceOf(await vault.getAddress());
            expect(balanceBefore - balanceAfter).to.equal(0n);
            expect(await vault.balances(await zkbtc.getAddress(), owner.address)).to.equal(amount);
        });

    });

});