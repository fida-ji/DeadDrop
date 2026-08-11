/**
 * Deploy the DeadDrop Intelligent Contract to GenLayer Bradbury testnet, then
 * configure it and verify it is live by reading a view method.
 *
 * Usage:
 *   1. Fund a wallet from https://testnet-faucet.genlayer.foundation
 *   2. Put its key in ../.env as ACCOUNT_PRIVATE_KEY (never commit this file)
 *   3. npm install && npm run deploy
 *
 * The private key is read from the environment only. It is never logged.
 */
import { readFileSync, writeFileSync } from "node:fs";
import {
  CONTRACT_PATH,
  DEPLOYMENT_PATH,
  activeChain,
  makeClient,
  pollAccepted,
  read,
  withRetry,
  write,
} from "./lib";
import type {
  DecodedDeployData,
  TransactionHash,
} from "genlayer-js/types";

// Appeal window on this testnet instance. Kept short so live demos and the
// seeded case files can complete settlement. Production would use hours to days.
const APPEAL_WINDOW_SECS = 60;

async function main() {
  const { account, client } = makeClient();

  console.log("Network      :", activeChain().name);
  console.log("Deployer     :", account.address);
  console.log("Contract file:", CONTRACT_PATH);

  const code = new Uint8Array(readFileSync(CONTRACT_PATH));
  await client.initializeConsensusSmartContract();

  console.log("\nDeploying... submitting transaction");
  const deployTx = await withRetry(
    () => client.deployContract({ code, args: [] }) as Promise<TransactionHash>,
  );
  console.log("Deploy tx    :", deployTx);

  const receipt = await pollAccepted(client, deployTx);
  const statusName = String(receipt.statusName ?? receipt.status ?? "");
  const decoded = receipt.txDataDecoded as DecodedDeployData | undefined;
  const address = (decoded?.contractAddress ??
    (receipt.recipient as string | undefined) ??
    (receipt as { data?: { contract_address?: string } }).data
      ?.contract_address) as `0x${string}` | undefined;

  if (!address) throw new Error("Could not resolve deployed contract address");
  console.log("Status       :", statusName);
  console.log("Contract     :", address);

  // --- Configure the live instance ---
  console.log("\nConfiguring protocol...");
  console.log("  set_appeal_window", APPEAL_WINDOW_SECS);
  await write(client, address, "set_appeal_window", [APPEAL_WINDOW_SECS]);

  const feeBps = process.env.FEE_BPS?.trim();
  if (feeBps && Number(feeBps) !== 100) {
    console.log("  set_fee_bps", feeBps);
    await write(client, address, "set_fee_bps", [Number(feeBps)]);
  }
  const feeRecipient = process.env.FEE_RECIPIENT?.trim();
  if (feeRecipient && /^0x[0-9a-fA-F]{40}$/.test(feeRecipient)) {
    console.log("  set_fee_recipient", feeRecipient);
    await write(client, address, "set_fee_recipient", [feeRecipient]);
  }

  // --- Verify live by reading a view method ---
  console.log("\nVerifying live (get_protocol_config)...");
  const config = await read<Record<string, unknown>>(
    client,
    address,
    "get_protocol_config",
  );
  console.log(JSON.stringify(config, null, 2));

  const dropCount = await read<number>(client, address, "get_drop_count");
  console.log("drop_count   :", dropCount);

  const record = {
    network: "testnet-bradbury",
    chainId: 4221,
    contractAddress: address,
    deployTx,
    deployer: account.address,
    appealWindowSecs: APPEAL_WINDOW_SECS,
    explorer: `https://explorer-bradbury.genlayer.com/tx/${deployTx}`,
    contractExplorer: `https://explorer-bradbury.genlayer.com/contracts/${address}`,
    verifiedAt: new Date().toISOString(),
    protocolConfig: config,
  };
  writeFileSync(DEPLOYMENT_PATH, JSON.stringify(record, null, 2) + "\n");

  console.log("\n\u2713 DeadDrop deployed and verified live on Bradbury");
  console.log("Contract address:", address);
  console.log("Deploy tx       :", deployTx);
  console.log("Explorer        :", record.contractExplorer);
  console.log("\nWrote", DEPLOYMENT_PATH);
  console.log("Next: bake this address into the frontend and run `npm run seed`.");
}

main().catch((err) => {
  console.error("\nDeployment error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
