import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  connectWallet,
  ensureNetwork,
  getChainId,
  getConnectedAccount,
  hasWallet,
  onWalletEvent,
} from "./genlayer";
import { NETWORK } from "./config";

interface WalletState {
  account: `0x${string}` | null;
  chainId: number | null;
  onNetwork: boolean;
  walletAvailable: boolean;
  connecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  switchNetwork: () => Promise<void>;
}

const Ctx = createContext<WalletState | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<`0x${string}` | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const walletAvailable = hasWallet();

  // Restore an already-authorized session on load (no prompt).
  useEffect(() => {
    let active = true;
    (async () => {
      const acc = await getConnectedAccount();
      const cid = await getChainId();
      if (!active) return;
      setAccount(acc);
      setChainId(cid);
    })();
    return () => {
      active = false;
    };
  }, []);

  // React to wallet account and chain changes.
  useEffect(() => {
    const offAcc = onWalletEvent("accountsChanged", (...args) => {
      const accs = args[0] as string[];
      setAccount(accs && accs.length > 0 ? (accs[0] as `0x${string}`) : null);
    });
    const offChain = onWalletEvent("chainChanged", (...args) => {
      const id = args[0] as string;
      setChainId(typeof id === "string" ? parseInt(id, 16) : null);
    });
    return () => {
      offAcc();
      offChain();
    };
  }, []);

  const connect = useCallback(async () => {
    setError(null);
    setConnecting(true);
    try {
      const acc = await connectWallet();
      await ensureNetwork();
      setAccount(acc);
      setChainId(await getChainId());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setConnecting(false);
    }
  }, []);

  const switchNetwork = useCallback(async () => {
    setError(null);
    try {
      await ensureNetwork();
      setChainId(await getChainId());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  // EIP-1193 has no true disconnect; we clear local session state.
  const disconnect = useCallback(() => {
    setAccount(null);
    setError(null);
  }, []);

  const value = useMemo<WalletState>(
    () => ({
      account,
      chainId,
      onNetwork: chainId === NETWORK.chainId,
      walletAvailable,
      connecting,
      error,
      connect,
      disconnect,
      switchNetwork,
    }),
    [account, chainId, walletAvailable, connecting, error, connect, disconnect, switchNetwork],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWallet(): WalletState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWallet must be used within WalletProvider");
  return v;
}
