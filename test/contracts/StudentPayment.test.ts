import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";

async function deployStudentPaymentFixture() {
  const [university, student1, student2, vendor] = await ethers.getSigners();

  const StudentRegistry = await ethers.getContractFactory("StudentRegistry");
  const registry = await StudentRegistry.deploy();
  await registry.waitForDeployment();

  const WalletBalance = await ethers.getContractFactory("WalletBalance");
  const walletBalance = await WalletBalance.deploy();
  await walletBalance.waitForDeployment();

  const StudentPayment = await ethers.getContractFactory("StudentPayment");
  const payment = await StudentPayment.deploy(
    await registry.getAddress(),
    await walletBalance.getAddress()
  );
  await payment.waitForDeployment();

  const hash = ethers.keccak256(ethers.toUtf8Bytes("STU0001"));
  await registry.registerStudent(student1.address, hash);

  return { registry, walletBalance, payment, university, student1, student2, vendor };
}

describe("StudentPayment", function () {
  describe("Verified student", function () {
    it("pays the vendor 80% of the payment", async function () {
      const { payment, student1, vendor } = await loadFixture(deployStudentPaymentFixture);
      const amount = ethers.parseEther("1");
      const servicePointId = ethers.encodeBytes32String("SP-01");

      const vendorBalanceBefore = await ethers.provider.getBalance(vendor.address);
      await payment.connect(student1).pay(vendor.address, servicePointId, { value: amount });
      const vendorBalanceAfter = await ethers.provider.getBalance(vendor.address);

      expect(vendorBalanceAfter - vendorBalanceBefore).to.equal((amount * BigInt(8000)) / BigInt(10000));
    });

    it("refunds the student 20% of the payment", async function () {
      const { payment, student1, vendor } = await loadFixture(deployStudentPaymentFixture);
      const amount = ethers.parseEther("1");
      const servicePointId = ethers.encodeBytes32String("SP-01");

      const studentBalanceBefore = await ethers.provider.getBalance(student1.address);
      const tx = await payment
        .connect(student1)
        .pay(vendor.address, servicePointId, { value: amount });
      const receipt = await tx.wait();
      const gasCost = receipt!.gasUsed * receipt!.gasPrice;
      const studentBalanceAfter = await ethers.provider.getBalance(student1.address);

      const expectedRefund = (amount * BigInt(2000)) / BigInt(10000);
      const expectedBalance = studentBalanceBefore - amount - gasCost + expectedRefund;
      expect(studentBalanceAfter).to.equal(expectedBalance);
    });

    it("emits PaymentProcessed with discountApplied true", async function () {
      const { payment, student1, vendor } = await loadFixture(deployStudentPaymentFixture);
      const amount = ethers.parseEther("1");
      const servicePointId = ethers.encodeBytes32String("SP-01");
      const finalAmount = amount - (amount * BigInt(2000)) / BigInt(10000);

      await expect(
        payment.connect(student1).pay(vendor.address, servicePointId, { value: amount })
      )
        .to.emit(payment, "PaymentProcessed")
        .withArgs(student1.address, vendor.address, amount, finalAmount, true, servicePointId);
    });
  });

  describe("Non-verified student", function () {
    it("pays the vendor 100% of the payment", async function () {
      const { payment, student2, vendor } = await loadFixture(deployStudentPaymentFixture);
      const amount = ethers.parseEther("1");
      const servicePointId = ethers.encodeBytes32String("SP-01");

      const vendorBalanceBefore = await ethers.provider.getBalance(vendor.address);
      await payment.connect(student2).pay(vendor.address, servicePointId, { value: amount });
      const vendorBalanceAfter = await ethers.provider.getBalance(vendor.address);

      expect(vendorBalanceAfter - vendorBalanceBefore).to.equal(amount);
    });

    it("sends no refund to the payer", async function () {
      const { payment, student2, vendor } = await loadFixture(deployStudentPaymentFixture);
      const amount = ethers.parseEther("1");
      const servicePointId = ethers.encodeBytes32String("SP-01");

      const studentBalanceBefore = await ethers.provider.getBalance(student2.address);
      const tx = await payment
        .connect(student2)
        .pay(vendor.address, servicePointId, { value: amount });
      const receipt = await tx.wait();
      const gasCost = receipt!.gasUsed * receipt!.gasPrice;
      const studentBalanceAfter = await ethers.provider.getBalance(student2.address);

      expect(studentBalanceAfter).to.equal(studentBalanceBefore - amount - gasCost);
    });

    it("emits PaymentProcessed with discountApplied false", async function () {
      const { payment, student2, vendor } = await loadFixture(deployStudentPaymentFixture);
      const amount = ethers.parseEther("1");
      const servicePointId = ethers.encodeBytes32String("SP-01");

      await expect(
        payment.connect(student2).pay(vendor.address, servicePointId, { value: amount })
      )
        .to.emit(payment, "PaymentProcessed")
        .withArgs(student2.address, vendor.address, amount, amount, false, servicePointId);
    });
  });

  describe("setDiscountBps", function () {
    it("allows the university to update the rate", async function () {
      const { payment } = await loadFixture(deployStudentPaymentFixture);
      await payment.setDiscountBps(1000);
      expect(await payment.studentDiscountBps()).to.equal(1000);
    });

    it("reverts when called by a non-university account", async function () {
      const { payment, student1 } = await loadFixture(deployStudentPaymentFixture);
      await expect(payment.connect(student1).setDiscountBps(1000)).to.be.revertedWith(
        "Only UCT can update discount"
      );
    });

    it("reverts when bps exceeds 10000", async function () {
      const { payment } = await loadFixture(deployStudentPaymentFixture);
      await expect(payment.setDiscountBps(10001)).to.be.revertedWith(
        "Cannot exceed 100 percent"
      );
    });
  });

  describe("Edge cases", function () {
    it("reverts when msg.value is 0", async function () {
      const { payment, student1, vendor } = await loadFixture(deployStudentPaymentFixture);
      const servicePointId = ethers.encodeBytes32String("SP-01");
      await expect(
        payment.connect(student1).pay(vendor.address, servicePointId, { value: 0 })
      ).to.be.revertedWith("Payment required");
    });
  });
});
