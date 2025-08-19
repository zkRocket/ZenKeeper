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

        await zkBTC.mint(user1.address, MIN_PRICE * 2n);
        await zkBTC.connect(user1).approve(await zkRocket.getAddress(), MIN_PRICE * 2n);

        const protocolAddr = await mockApp.getAddress();
        let bidPrice = await zkRocket.getCurrentPrice() + 10n;

        await zkRocket.connect(user1).bid(protocolAddr, bidPrice);
    }

    beforeEach(async function (){
        await loadFixture(deployContracts);
    });

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
            let vaultAddress = await mockVault.getAddress();
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

            let balanceBefore = await zkBTC.balanceOf(await mockVault.getAddress());
            expect(await zkBTC.balanceOf(await owner.address)).to.equal(0n);

            await expect(
                zkRocket.retrieve(provenData, txid)
            ).to.emit(mockApp, "Execute");

            let balanceAfter = await zkBTC.balanceOf(await mockVault.getAddress());
            expect(balanceBefore - balanceAfter).to.equal(amount);
            expect(await zkBTC.balanceOf(await owner.address)).to.equal(amount);

        });

        it("to vault address， user not withdraw， no app data", async function () {
            let vaultAddress = await mockVault.getAddress();
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

            let balanceBefore = await zkBTC.balanceOf(await mockVault.getAddress());
            expect(await zkBTC.balanceOf(await owner.address)).to.equal(0n);

            await expect(
                zkRocket.retrieve(provenData, txid)
            ).to.emit(mockApp, "Execute");

            let balanceAfter = await zkBTC.balanceOf(await mockVault.getAddress());
            expect(balanceBefore - balanceAfter).to.equal(0n);
            expect(await mockVault.balances(owner.address)).to.equal(amount);
        });

        it("to vault address， user not withdraw， appdata length= 31", async function () {
            let vaultAddress = await mockVault.getAddress();
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

            let balanceBefore = await zkBTC.balanceOf(await mockVault.getAddress());
            expect(await zkBTC.balanceOf(await owner.address)).to.equal(0n);

            await expect(
                zkRocket.retrieve(provenData, txid)
            ).to.emit(mockApp, "Execute");

            let balanceAfter = await zkBTC.balanceOf(await mockVault.getAddress());
            expect(balanceBefore - balanceAfter).to.equal(0n);
            expect(await mockVault.balances(owner.address)).to.equal(amount);
        });

        it("to vault address， user not withdraw， appdata length= 32", async function () {
            let vaultAddress = await mockVault.getAddress();
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

            let balanceBefore = await zkBTC.balanceOf(await mockVault.getAddress());
            expect(await zkBTC.balanceOf(await owner.address)).to.equal(0n);

            await expect(
                zkRocket.retrieve(provenData, txid)
            ).to.emit(mockApp, "Execute");

            let balanceAfter = await zkBTC.balanceOf(await mockVault.getAddress());
            expect(balanceBefore - balanceAfter).to.equal(0n);
            expect(await mockVault.balances(owner.address)).to.equal(amount);
        });

        it("to vault address， user not withdraw， appdata length= 211", async function () {
            let vaultAddress = await mockVault.getAddress();
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

            let balanceBefore = await zkBTC.balanceOf(await mockVault.getAddress());
            expect(await zkBTC.balanceOf(await owner.address)).to.equal(0n);

            await expect(
                zkRocket.retrieve(provenData, txid)
            ).to.emit(mockApp, "Execute");

            let balanceAfter = await zkBTC.balanceOf(await mockVault.getAddress());
            expect(balanceBefore - balanceAfter).to.equal(0n);
            expect(await mockVault.balances(owner.address)).to.equal(amount);
        });

        it("to vault address， user not withdraw， appdata length= 212", async function () {
            let vaultAddress = await mockVault.getAddress();
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

            let balanceBefore = await zkBTC.balanceOf(await mockVault.getAddress());
            expect(await zkBTC.balanceOf(await owner.address)).to.equal(0n);

            await expect(
                zkRocket.retrieve(provenData, txid)
            ).to.emit(mockApp, "Execute");

            let balanceAfter = await zkBTC.balanceOf(await mockVault.getAddress());
            expect(balanceBefore - balanceAfter).to.equal(0n);
            expect(await mockVault.balances(owner.address)).to.equal(amount);
        });

        it("to vault address， user not withdraw， appdata length= 213", async function () {
            let vaultAddress = await mockVault.getAddress();
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

            let balanceBefore = await zkBTC.balanceOf(await mockVault.getAddress());
            expect(await zkBTC.balanceOf(await owner.address)).to.equal(0n);

            await expect(
                zkRocket.retrieve(provenData, txid)
            ).to.emit(mockApp, "Execute");

            let balanceAfter = await zkBTC.balanceOf(await mockVault.getAddress());
            expect(balanceBefore - balanceAfter).to.equal(0n);
            expect(await mockVault.balances(owner.address)).to.equal(amount);
        });

        it("to vault address， user not withdraw， appdata length= 65491", async function () {
            let vaultAddress = await mockVault.getAddress();
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

            let balanceBefore = await zkBTC.balanceOf(await mockVault.getAddress());
            expect(await zkBTC.balanceOf(await owner.address)).to.equal(0n);

            await expect(
                zkRocket.retrieve(provenData, txid)
            ).to.emit(mockApp, "Execute");

            let balanceAfter = await zkBTC.balanceOf(await mockVault.getAddress());
            expect(balanceBefore - balanceAfter).to.equal(0n);
            expect(await mockVault.balances(owner.address)).to.equal(amount);
        });

        it("to vault address， user not withdraw， appdata length= 65492", async function () {
            let vaultAddress = await mockVault.getAddress();
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

            let balanceBefore = await zkBTC.balanceOf(await mockVault.getAddress());
            expect(await zkBTC.balanceOf(await owner.address)).to.equal(0n);

            await expect(
                zkRocket.retrieve(provenData, txid)
            ).to.emit(mockApp, "Execute");

            let balanceAfter = await zkBTC.balanceOf(await mockVault.getAddress());
            expect(balanceBefore - balanceAfter).to.equal(0n);
            expect(await mockVault.balances(owner.address)).to.equal(amount);
        });

        it("to vault address， user not withdraw， appdata length= 65493", async function () {
            let vaultAddress = await mockVault.getAddress();
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

            let balanceBefore = await zkBTC.balanceOf(await mockVault.getAddress());
            expect(await zkBTC.balanceOf(await owner.address)).to.equal(0n);

            await expect(
                zkRocket.retrieve(provenData, txid)
            ).to.emit(mockApp, "Execute");

            let balanceAfter = await zkBTC.balanceOf(await mockVault.getAddress());
            expect(balanceBefore - balanceAfter).to.equal(0n);
            expect(await mockVault.balances(owner.address)).to.equal(amount);
        });

        it("to vault address， user not withdraw， appdata length= 132000", async function () {
            let vaultAddress = await mockVault.getAddress();
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

            let balanceBefore = await zkBTC.balanceOf(await mockVault.getAddress());
            expect(await zkBTC.balanceOf(await owner.address)).to.equal(0n);

            await expect(
                zkRocket.retrieve(provenData, txid)
            ).to.emit(mockApp, "Execute");

            let balanceAfter = await zkBTC.balanceOf(await mockVault.getAddress());
            expect(balanceBefore - balanceAfter).to.equal(0n);
            expect(await mockVault.balances(owner.address)).to.equal(amount);
        });

        it("to vault address， no protocol, user not withdraw， appdata length= 132000", async function () {
            let vaultAddress = await mockVault.getAddress();
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

            let balanceBefore = await zkBTC.balanceOf(await mockVault.getAddress());
            expect(await zkBTC.balanceOf(await owner.address)).to.equal(0n);

            await expect(
                zkRocket.retrieve(provenData, txid)
            ).to.not.emit(mockApp, "Execute");

            let balanceAfter = await zkBTC.balanceOf(await mockVault.getAddress());
            expect(balanceBefore - balanceAfter).to.equal(0n);
            expect(await mockVault.balances(owner.address)).to.equal(amount);
        });

        it("admin register application directly", async function () {
            expect(await zkRocket.nextProtocolId()).to.equal(2);

            await zkRocket.registerApplication(await mockApp.getAddress());
            expect(await zkRocket.nextProtocolId()).to.equal(3);
            expect(await zkRocket.applications(2)).to.equal(await mockApp.getAddress());

            await zkRocket.registerApplication(await mockApp.getAddress());
            expect(await zkRocket.nextProtocolId()).to.equal(4);
            expect(await zkRocket.applications(3)).to.equal(await mockApp.getAddress());
        });

        it("register application fail because of not admin", async function () {
            expect(await zkRocket.nextProtocolId()).to.equal(2);
            await expect(
                zkRocket.connect(user1).registerApplication(await mockApp.getAddress())
            ).to.be.revertedWith("Caller is not admin");
            expect(await zkRocket.nextProtocolId()).to.equal(2);
        });

        it("add vault fail because of not admin", async function () {
            await expect(
                zkRocket.connect(user1).addVault(await mockApp.getAddress())
            ).to.be.revertedWith("Caller is not admin");
        });

        it("remove vault fail because of not admin", async function () {
            await expect(
                zkRocket.connect(user1).removeVault(await mockApp.getAddress())
            ).to.be.revertedWith("Caller is not admin");
        });

    });
});