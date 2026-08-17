import { ethers } from "hardhat";
import { writeFileSync, mkdirSync } from "fs";

async function main() {
  const [deployer] = await ethers.getSigners();

  const StudentRegistry = await ethers.getContractFactory("StudentRegistry");
  const registry = await StudentRegistry.deploy();
  await registry.waitForDeployment();
  const registryAddress = await registry.getAddress();
  const registryDeployTx = registry.deploymentTransaction();
  const registryReceipt = registryDeployTx ? await registryDeployTx.wait() : null;
  console.log("StudentRegistry deployed to:", registryAddress);

  const WalletBalance = await ethers.getContractFactory("WalletBalance");
  const walletBalance = await WalletBalance.deploy();
  await walletBalance.waitForDeployment();
  const walletBalanceAddress = await walletBalance.getAddress();
  const walletBalanceDeployTx = walletBalance.deploymentTransaction();
  const walletBalanceReceipt = walletBalanceDeployTx ? await walletBalanceDeployTx.wait() : null;
  console.log("WalletBalance deployed to:", walletBalanceAddress);

  const StudentPayment = await ethers.getContractFactory("StudentPayment");
  const payment = await StudentPayment.deploy(registryAddress, walletBalanceAddress);
  await payment.waitForDeployment();
  const paymentAddress = await payment.getAddress();
  const paymentDeployTx = payment.deploymentTransaction();
  const paymentReceipt = paymentDeployTx ? await paymentDeployTx.wait() : null;
  console.log("StudentPayment deployed to:", paymentAddress);

  mkdirSync("deployments", { recursive: true });

  const deploymentInfo = {
    network: "sepolia",
    chainId: 11155111,
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    contracts: {
      StudentRegistry: {
        address: registryAddress,
        blockNumber: registryReceipt?.blockNumber ?? null,
      },
      WalletBalance: {
        address: walletBalanceAddress,
        blockNumber: walletBalanceReceipt?.blockNumber ?? null,
      },
      StudentPayment: {
        address: paymentAddress,
        blockNumber: paymentReceipt?.blockNumber ?? null,
      },
    },
  };

  writeFileSync("deployments/sepolia.json", JSON.stringify(deploymentInfo, null, 2));

  console.log("=== COPY THESE TO YOUR .env.local ===");
  console.log("STUDENT_REGISTRY_ADDRESS=" + registryAddress);
  console.log("WALLET_BALANCE_ADDRESS=" + walletBalanceAddress);
  console.log("STUDENT_PAYMENT_ADDRESS=" + paymentAddress);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
