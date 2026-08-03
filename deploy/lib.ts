/**
 * Shared helpers for deploying, configuring, and seeding DeadDrop on GenLayer
 * Bradbury. The private key is read from the repository-root .env via process.env
 * only. It is never logged.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { createClient, createAccount } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";
import {
  TransactionStatus,
  type GenLayerClient,
  type GenLayerChain,
  type TransactionHash,
} from "genlayer-js/types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, "..");
export const CONTRACT_PATH = path.resolve(ROOT, "contracts", "deaddrop.py");
export const DEPLOYMENT_PATH = path.resolve(__dirname, "deployment.json");

loadEnv({ path: path.resolve(ROOT, ".env") });

export function requireKey(): `0x${string}` {
  const key = process.env.ACCOUNT_PRIVATE_KEY?.trim();
  if (!key) {
    throw new Error(
      "ACCOUNT_PRIVATE_KEY is not set. Create ../.env from ../.env.example and add a funded Bradbury key.",
    );
  }
  return (key.startsWith("0x") ? key : `0x${key}`) as `0x${string}`;
}

export function makeClient() {
  const account = createAccount(requireKey());
  const client = createClient({
    chain: testnetBradbury,
    account,
  }) as GenLayerClient<GenLayerChain>;
  return { account, client };
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Poll a transaction to ACCEPTED/FINALIZED. genlayer-js waitForTransactionReceipt
 * can throw on BigInt serialization, so we poll getTransaction directly.
 */
export async function pollAccepted(
  client: GenLayerClient<GenLayerChain>,
  hash: TransactionHash,
  retries = 180,
  intervalMs = 4000,
): Promise<Record<string, unknown>> {
  for (let i = 0; i < retries; i++) {
    try {
      const tx = (await client.getTransaction({ hash })) as Record<string, unknown>;
      const s = String(tx?.statusName ?? tx?.status ?? "");
      if (s === "ACCEPTED" || s === "FINALIZED") return tx;
      if (s === "UNDETERMINED" || s === "CANCELED") {
        throw new Error(`Transaction ${s}`);
      }
    } catch {
      /* transient RPC error - keep polling */
    }
    await sleep(intervalMs);
  }
  throw new Error(`Timed out waiting for acceptance of ${hash}`);
}

/** Read a view method with light retry for rate limits. */
export async function read<T = unknown>(
  client: GenLayerClient<GenLayerChain>,
  address: `0x${string}`,
  functionName: string,
  args: unknown[] = [],
): Promise<T> {
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      return (await client.readContract({
        address,
        functionName,
        args: args as never,
        // Read the latest accepted state so freshly accepted writes are visible.
        transactionHashVariant: "latest-nonfinal" as never,
      })) as T;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/rate limit|-32429|\b429\b/i.test(msg) && attempt < 5) {
        await sleep(1500 * (attempt + 1));
        continue;
      }
      throw err;
    }
  }
  throw new Error("read failed after retries");
}

/** Submit a write and wait for acceptance. Returns the tx hash. */
export async function write(
  client: GenLayerClient<GenLayerChain>,
  address: `0x${string}`,
  functionName: string,
  args: unknown[] = [],
  value = 0n,
): Promise<TransactionHash> {
  const hash = (await client.writeContract({
    address,
    functionName,
    args: args as never,
    value,
    // Explicit generous gas limit for payable / value-bearing writes.
    ...(value > 0n ? { gas: 12_000_000n } : {}),
  })) as TransactionHash;
  await pollAccepted(client, hash);
  return hash;
}

export { TransactionStatus };
