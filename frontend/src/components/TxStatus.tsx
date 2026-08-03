import { txUrl } from "../lib/config";
import { External } from "./Icons";

export type TxPhase = "idle" | "signing" | "pending" | "accepted" | "error";

export interface TxState {
  phase: TxPhase;
  hash?: string;
  message?: string;
}

const PHASE_TEXT: Record<TxPhase, string> = {
  idle: "",
  signing: "Awaiting wallet signature\u2026",
  pending: "Submitted. Waiting for validator consensus\u2026",
  accepted: "Accepted on chain.",
  error: "Transaction failed.",
};

export default function TxStatus({ tx }: { tx: TxState }) {
  if (tx.phase === "idle") return null;

  const cls =
    tx.phase === "error"
      ? "txstatus txstatus--err"
      : tx.phase === "accepted"
        ? "txstatus txstatus--ok"
        : "txstatus";

  const busy = tx.phase === "signing" || tx.phase === "pending";

  return (
    <div className={cls} role="status" aria-live="polite">
      <div className="txstatus__row">
        {busy && <span className="spinner" />}
        {tx.phase === "accepted" && <span className="dot-ok" />}
        {tx.phase === "error" && <span className="dot-err" />}
        <span className="txstatus__phase">{PHASE_TEXT[tx.phase]}</span>
      </div>
      {tx.hash && (
        <div className="txstatus__link">
          <a href={txUrl(tx.hash)} target="_blank" rel="noreferrer">
            View transaction on explorer <External size={12} style={{ display: "inline", verticalAlign: "-2px" }} />
          </a>
        </div>
      )}
      {tx.phase === "error" && tx.message && <div className="txstatus__msg">{tx.message}</div>}
    </div>
  );
}
