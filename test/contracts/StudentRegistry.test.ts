import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";

async function deployStudentRegistryFixture() {
  const [owner, student1, student2] = await ethers.getSigners();
  const StudentRegistry = await ethers.getContractFactory("StudentRegistry");
  const registry = await StudentRegistry.deploy();
  await registry.waitForDeployment();
  return { registry, owner, student1, student2 };
}

describe("StudentRegistry", function () {
  describe("Deployment", function () {
    it("sets the deployer as university", async function () {
      const { registry, owner } = await loadFixture(deployStudentRegistryFixture);
      expect(await registry.university()).to.equal(owner.address);
    });
  });

  describe("registerStudent", function () {
    it("reverts when called by a non-owner", async function () {
      const { registry, student1 } = await loadFixture(deployStudentRegistryFixture);
      const hash = ethers.keccak256(ethers.toUtf8Bytes("STU0001"));
      await expect(
        registry.connect(student1).registerStudent(student1.address, hash)
      ).to.be.revertedWith("Only UCT can call this");
    });

    it("returns false before registration", async function () {
      const { registry, student1 } = await loadFixture(deployStudentRegistryFixture);
      expect(await registry.checkStudent(student1.address)).to.equal(false);
    });

    it("returns true after registration", async function () {
      const { registry, student1 } = await loadFixture(deployStudentRegistryFixture);
      const hash = ethers.keccak256(ethers.toUtf8Bytes("STU0001"));
      await registry.registerStudent(student1.address, hash);
      expect(await registry.checkStudent(student1.address)).to.equal(true);
    });

    it("emits StudentRegistered with the correct arguments", async function () {
      const { registry, student1 } = await loadFixture(deployStudentRegistryFixture);
      const hash = ethers.keccak256(ethers.toUtf8Bytes("STU0001"));
      await expect(registry.registerStudent(student1.address, hash))
        .to.emit(registry, "StudentRegistered")
        .withArgs(student1.address, hash);
    });
  });

  describe("removeStudent", function () {
    it("returns false after removal", async function () {
      const { registry, student1 } = await loadFixture(deployStudentRegistryFixture);
      const hash = ethers.keccak256(ethers.toUtf8Bytes("STU0001"));
      await registry.registerStudent(student1.address, hash);
      await registry.removeStudent(student1.address);
      expect(await registry.checkStudent(student1.address)).to.equal(false);
    });

    it("reverts when called by a non-owner", async function () {
      const { registry, student1, student2 } = await loadFixture(deployStudentRegistryFixture);
      await expect(
        registry.connect(student2).removeStudent(student1.address)
      ).to.be.revertedWith("Only UCT can call this");
    });

    it("emits StudentRemoved with the correct argument", async function () {
      const { registry, student1 } = await loadFixture(deployStudentRegistryFixture);
      const hash = ethers.keccak256(ethers.toUtf8Bytes("STU0001"));
      await registry.registerStudent(student1.address, hash);
      await expect(registry.removeStudent(student1.address))
        .to.emit(registry, "StudentRemoved")
        .withArgs(student1.address);
    });
  });
});
