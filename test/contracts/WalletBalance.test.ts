import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";

async function deployWalletBalanceFixture() {
  const [owner, student1] = await ethers.getSigners();
  const WalletBalance = await ethers.getContractFactory("WalletBalance");
  const walletBalance = await WalletBalance.deploy();
  await walletBalance.waitForDeployment();
  return { walletBalance, owner, student1 };
}

describe("WalletBalance", function () {
  describe("topUp", function () {
    it("increases the balance by msg.value", async function () {
      const { walletBalance, student1 } = await loadFixture(deployWalletBalanceFixture);
      const amount = ethers.parseEther("1");
      await walletBalance.connect(student1).topUp({ value: amount });
      expect(await walletBalance.balances(student1.address)).to.equal(amount);
    });

    it("emits TopUp with the correct arguments", async function () {
      const { walletBalance, student1 } = await loadFixture(deployWalletBalanceFixture);
      const amount = ethers.parseEther("1");
      await expect(walletBalance.connect(student1).topUp({ value: amount }))
        .to.emit(walletBalance, "TopUp")
        .withArgs(student1.address, amount);
    });

    it("reverts when msg.value is 0", async function () {
      const { walletBalance, student1 } = await loadFixture(deployWalletBalanceFixture);
      await expect(
        walletBalance.connect(student1).topUp({ value: 0 })
      ).to.be.revertedWith("Amount required");
    });
  });

  describe("receive", function () {
    it("increases the balance on a direct ETH send", async function () {
      const { walletBalance, student1 } = await loadFixture(deployWalletBalanceFixture);
      const amount = ethers.parseEther("0.5");
      await student1.sendTransaction({
        to: await walletBalance.getAddress(),
        value: amount,
      });
      expect(await walletBalance.balances(student1.address)).to.equal(amount);
    });
  });

  describe("deductBalance", function () {
    it("reduces the balance correctly", async function () {
      const { walletBalance, student1 } = await loadFixture(deployWalletBalanceFixture);
      const topUpAmount = ethers.parseEther("1");
      const deductAmount = ethers.parseEther("0.4");
      await walletBalance.connect(student1).topUp({ value: topUpAmount });
      const servicePointId = ethers.encodeBytes32String("SP-01");
      await walletBalance.deductBalance(student1.address, deductAmount, servicePointId);
      expect(await walletBalance.balances(student1.address)).to.equal(
        topUpAmount - deductAmount
      );
    });

    it("emits Spent with the correct arguments", async function () {
      const { walletBalance, student1 } = await loadFixture(deployWalletBalanceFixture);
      const topUpAmount = ethers.parseEther("1");
      const deductAmount = ethers.parseEther("0.4");
      await walletBalance.connect(student1).topUp({ value: topUpAmount });
      const servicePointId = ethers.encodeBytes32String("SP-01");
      await expect(
        walletBalance.deductBalance(student1.address, deductAmount, servicePointId)
      )
        .to.emit(walletBalance, "Spent")
        .withArgs(student1.address, deductAmount, servicePointId);
    });

    it("reverts with Insufficient balance when amount exceeds balance", async function () {
      const { walletBalance, student1 } = await loadFixture(deployWalletBalanceFixture);
      const servicePointId = ethers.encodeBytes32String("SP-01");
      await expect(
        walletBalance.deductBalance(student1.address, ethers.parseEther("1"), servicePointId)
      ).to.be.revertedWith("Insufficient balance");
    });
  });

  describe("getBalance", function () {
    it("returns 0 for a new address", async function () {
      const { walletBalance, student1 } = await loadFixture(deployWalletBalanceFixture);
      expect(await walletBalance.getBalance(student1.address)).to.equal(0);
    });

    it("returns the correct amount after topUp", async function () {
      const { walletBalance, student1 } = await loadFixture(deployWalletBalanceFixture);
      const amount = ethers.parseEther("2");
      await walletBalance.connect(student1).topUp({ value: amount });
      expect(await walletBalance.getBalance(student1.address)).to.equal(amount);
    });
  });
});
