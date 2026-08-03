import { createClient } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";
import type { CalldataEncodable, Hash } from "genlayer-js/types";
import { CONTRACT_ADDRESS, NETWORK } from "./config";

// --- Provider ---------------------------------------------------------------

export function getInjectedProvider(): Eip1193Provider | undefined {
  if (typeof window === "undefined") return undefined;
  return window.ethereum;
}

export function hasWallet(): boolean {
  return !!getInjectedProvider();
}

// Route all GenLayer RPC through the same-origin /api/rpc path. In production
// Netlify rewrites it to the Bradbury RPC; in dev Vite proxies it. This keeps
// requests same-origin so privacy/ad/wallet extensions do not block them.
// Hosting that cannot proxy API paths (e.g. Firebase Hosting) builds with
// VITE_RPC_ENDPOINT set to talk to the RPC directly.
function rpcEndpoint(): string {
  const override = import.meta.env.VITE_RPC_ENDPOINT?.trim();
  if (override) return override;
  if (typeof window !== "undefined") return `${window.location.origin}/api/rpc`;
  return NETWORK.rpc;
}

// --- Clients ----------------------------------------------------------------

export function getReadClient() {
  return createClient({ chain: testnetBradbury, endpoint: rpcEndpoint() });
}

export function getWriteClient(address: `0x${string}`) {
  const provider = getInjectedProvider();
  if (!provider) throw new Error("No wallet found. Install a browser wallet to continue.");
  return createClient({
    chain: testnetBradbury,
    account: address,
    endpoint: rpcEndpoint(),
    // genlayer-js accepts an EIP-1193 provider for browser signing.
    provider: provider as never,
  });
}

// --- Wallet lifecycle -------------------------------------------------------

export async function connectWallet(): Promise<`0x${string}`> {
  const provider = getInjectedProvider();
  if (!provider) throw new Error("No wallet found. Install a browser wallet to continue.");
  const accounts = (await provider.request({
    method: "eth_requestAccounts",
  })) as string[];
  if (!accounts || accounts.length === 0) throw new Error("No account authorized.");
  return accounts[0] as `0x${string}`;
}

export async function getConnectedAccount(): Promise<`0x${string}` | null> {
  const provider = getInjectedProvider();
  if (!provider) return null;
  try {
    const accounts = (await provider.request({ method: "eth_accounts" })) as string[];
    return accounts && accounts.length > 0 ? (accounts[0] as `0x${string}`) : null;
  } catch {
    return null;
  }
}

export async function getChainId(): Promise<number | null> {
  const provider = getInjectedProvider();
  if (!provider) return null;
  try {
    const id = (await provider.request({ method: "eth_chainId" })) as string;
    return parseInt(id, 16);
  } catch {
    return null;
  }
}

// Add or switch the wallet to Bradbury. No MetaMask Snaps required.
export async function ensureBradbury(): Promise<void> {
  const provider = getInjectedProvider();
  if (!provider) throw new Error("No wallet found.");
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: NETWORK.chainIdHex }],
    });
  } catch (err: unknown) {
    const code = (err as { code?: number })?.code;
    // 4902 = chain not added yet. Add it, then it becomes active.
    if (code === 4902 || /Unrecognized chain/i.test(String((err as Error)?.message))) {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: NETWORK.chainIdHex,
            chainName: NETWORK.name,
            nativeCurrency: { name: NETWORK.currency, symbol: NETWORK.currency, decimals: 18 },
            rpcUrls: [NETWORK.rpc],
            blockExplorerUrls: [NETWORK.explorer],
          },
        ],
      });
    } else {
      throw err;
    }
  }
}

export function onWalletEvent(
  event: "accountsChanged" | "chainChanged",
  handler: (...args: unknown[]) => void,
): () => void {
  const provider = getInjectedProvider();
  if (!provider?.on || !provider.removeListener) return () => {};
  provider.on(event, handler);
  return () => provider.removeListener?.(event, handler);
}

// --- Reads (throttled, single global queue with backoff) --------------------

const MIN_READ_GAP_MS = 750;
let lastReadAt = 0;
let readQueue: Promise<unknown> = Promise.resolve();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isRateLimit(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /rate limit|exceeds defined limit|-32429|\b429\b/i.test(msg);
}

function scheduleRead<T>(job: () => Promise<T>): Promise<T> {
  const result = readQueue.then(async () => {
    const wait = Math.max(0, lastReadAt + MIN_READ_GAP_MS - Date.now());
    if (wait > 0) await sleep(wait);
    lastReadAt = Date.now();
    return job();
  });
  readQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

export async function readContract<T = unknown>(
  functionName: string,
  args: CalldataEncodable[] = [],
): Promise<T> {
  return scheduleRead(async () => {
    const client = getReadClient();
    const maxAttempts = 6;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        return (await client.readContract({
          address: CONTRACT_ADDRESS,
          functionName,
          args,
          // Reflect freshly accepted writes, not just finalized state.
          transactionHashVariant: "latest-nonfinal" as never,
        })) as T;
      } catch (err) {
        if (isRateLimit(err) && attempt < maxAttempts - 1) {
          await sleep(1000 * (attempt + 1));
          lastReadAt = Date.now();
          continue;
        }
        throw err;
      }
    }
    throw new Error("Read failed after retries");
  });
}

// --- Writes -----------------------------------------------------------------

export async function writeContract(
  address: `0x${string}`,
  functionName: string,
  args: CalldataEncodable[] = [],
  value: bigint = 0n,
): Promise<Hash> {
  const client = getWriteClient(address);
  // Ensure the wallet is on Bradbury before signing.
  await client.connect(NETWORK.chainKey);
  const hash = (await client.writeContract({
    address: CONTRACT_ADDRESS,
    functionName,
    args,
    value,
    // Explicit gas limit for payable / value-bearing writes.
    ...(value > 0n ? { gas: 12_000_000n } : {}),
  } as never)) as Hash;
  return hash;
}

export async function waitAccepted(hash: Hash) {
  const client = getReadClient();
  return client.waitForTransactionReceipt({
    hash,
    status: TransactionStatus.ACCEPTED,
    retries: 100,
    interval: 5000,
  });
}

export { TransactionStatus };
