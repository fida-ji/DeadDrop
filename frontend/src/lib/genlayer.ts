import { createClient } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";
import type { CalldataEncodable, Hash } from "genlayer-js/types";
import { CONTRACT_ADDRESS, NETWORK } from "./config";

// --- Provider ---------------------------------------------------------------

// DeadDrop connects with plain EIP-1193 only. genlayer-js still ships a
// Snaps-based connect() helper, so the injected provider is wrapped to reject
// every Snaps RPC method. That makes a Snap install prompt impossible from any
// code path and keeps the app usable in wallets that have no Snaps support.
const SNAPS_METHOD = /snaps?$/i;

let guardedProvider: Eip1193Provider | undefined;
let guardedFor: Eip1193Provider | undefined;

function withoutSnaps(provider: Eip1193Provider): Eip1193Provider {
  if (guardedFor === provider && guardedProvider) return guardedProvider;
  guardedFor = provider;
  guardedProvider = {
    request: (args) => {
      if (SNAPS_METHOD.test(args.method)) {
        return Promise.reject(
          new Error(`DeadDrop does not use MetaMask Snaps (blocked ${args.method}).`),
        );
      }
      return provider.request(args);
    },
    on: provider.on ? (e, h) => provider.on?.(e, h) : undefined,
    removeListener: provider.removeListener ? (e, h) => provider.removeListener?.(e, h) : undefined,
    isMetaMask: provider.isMetaMask,
  };
  return guardedProvider;
}

export function getInjectedProvider(): Eip1193Provider | undefined {
  if (typeof window === "undefined") return undefined;
  const injected = window.ethereum;
  return injected ? withoutSnaps(injected) : undefined;
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

// createClient attaches genlayer-js's Snaps helpers (connect, metamaskClient).
// They are dropped here so nothing in the app can reach them by accident; the
// provider guard above is the backstop if a dependency tries anyway.
function withoutSnapsActions<T>(client: T): T {
  delete (client as { connect?: unknown }).connect;
  delete (client as { metamaskClient?: unknown }).metamaskClient;
  return client;
}

export function getReadClient() {
  return withoutSnapsActions(createClient({ chain: testnetBradbury, endpoint: rpcEndpoint() }));
}

export function getWriteClient(address: `0x${string}`) {
  const provider = getInjectedProvider();
  if (!provider) throw new Error("No wallet found. Install a browser wallet to continue.");
  return withoutSnapsActions(
    createClient({
      chain: testnetBradbury,
      account: address,
      endpoint: rpcEndpoint(),
      // Signing goes through the injected EIP-1193 provider. Passing `account`
      // as an address string (not an object) keeps genlayer-js on its provider
      // path, so eth_sendTransaction is forwarded to the wallet and nothing is
      // signed locally. No MetaMask Snap is involved.
      provider: provider as never,
    }),
  );
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

// Add or switch the wallet to Bradbury using only standard EIP-1193 methods.
// Works in MetaMask, Rabby, Brave, Coinbase Wallet and any injected provider.
// No MetaMask Snap, no Flask build, no extra install step.
export async function ensureNetwork(): Promise<void> {
  const provider = getInjectedProvider();
  if (!provider) throw new Error("No wallet found.");

  if ((await getChainId()) === NETWORK.chainId) return;

  const chainParams = {
    chainId: NETWORK.chainIdHex,
    chainName: NETWORK.name,
    nativeCurrency: { name: NETWORK.currency, symbol: NETWORK.currency, decimals: 18 },
    rpcUrls: [NETWORK.rpc],
    blockExplorerUrls: [NETWORK.explorer],
  };

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: NETWORK.chainIdHex }],
    });
  } catch (err: unknown) {
    if (!isUnknownChainError(err)) throw err;
    // The chain is not in the wallet yet. Adding it also makes it active in
    // MetaMask; other wallets may need an explicit switch afterwards.
    await provider.request({ method: "wallet_addEthereumChain", params: [chainParams] });
    if ((await getChainId()) !== NETWORK.chainId) {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: NETWORK.chainIdHex }],
      });
    }
  }

  if ((await getChainId()) !== NETWORK.chainId) {
    throw new Error(`Switch your wallet to ${NETWORK.name} (chain ${NETWORK.chainId}) to continue.`);
  }
}

// 4902 is the standard "unrecognized chain" code. Some wallets bury it in a
// nested originalError, and a few only report it in the message.
function isUnknownChainError(err: unknown): boolean {
  const e = err as {
    code?: number;
    message?: string;
    data?: { originalError?: { code?: number } };
  };
  return (
    e?.code === 4902 ||
    e?.data?.originalError?.code === 4902 ||
    /unrecognized chain|chain .* not (added|found)|add.*chain/i.test(String(e?.message ?? ""))
  );
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
  // Standard EIP-1193 preflight: make sure the account is still authorized and
  // the wallet is on Bradbury. genlayer-js also exposes client.connect(), but
  // that helper installs the GenLayer MetaMask Snap (wallet_requestSnaps) and
  // fails on any wallet without Snaps support, so it is deliberately not used.
  const authorized = await getConnectedAccount();
  if (!authorized) throw new Error("Wallet is locked or not connected. Connect it and retry.");
  if (authorized.toLowerCase() !== address.toLowerCase()) {
    throw new Error(
      `The wallet is now on ${authorized}. Reconnect to send transactions from that account.`,
    );
  }
  await ensureNetwork();

  const client = getWriteClient(authorized);
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
