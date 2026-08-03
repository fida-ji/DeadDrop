import { useWallet } from "../lib/useWallet";
import { shortAddr } from "../lib/format";
import { NETWORK } from "../lib/config";
import { Wallet } from "./Icons";

export default function WalletButton() {
  const { account, onBradbury, walletAvailable, connecting, connect, disconnect, switchNetwork } =
    useWallet();

  if (!walletAvailable) {
    return (
      <a className="btn btn--ghost btn--sm" href="https://metamask.io/download/" target="_blank" rel="noreferrer">
        <Wallet size={15} /> Install wallet
      </a>
    );
  }

  if (!account) {
    return (
      <button className="btn btn--sm" onClick={() => void connect()} disabled={connecting}>
        <Wallet size={15} />
        {connecting ? "Connecting\u2026" : "Connect wallet"}
      </button>
    );
  }

  if (!onBradbury) {
    return (
      <button className="btn btn--sm" onClick={() => void switchNetwork()}>
        Switch to {NETWORK.name}
      </button>
    );
  }

  return (
    <button
      className="btn btn--ghost btn--sm"
      onClick={disconnect}
      title="Click to disconnect this session"
    >
      <span className="dot-ok" />
      {shortAddr(account)}
    </button>
  );
}
