import type { Drop } from "../lib/types";
import { addressUrl, contractUrl } from "../lib/config";
import {
  fmtDateTime,
  isZero,
  shortAddr,
  statusMeta,
  weiToGen,
} from "../lib/format";
import { External } from "./Icons";

export default function DropCard({ drop }: { drop: Drop }) {
  const meta = statusMeta(drop);
  const hasVerdict = drop.status === "adjudicated" || drop.status === "settled";
  const fee = (BigInt(drop.escrow_amount || "0") * BigInt(drop.fee_bps)) / 10000n;

  return (
    <article className="drop">
      <div className="drop__head">
        <span className="drop__cat">{drop.category}</span>
        <span className={`tag tag--${meta.tone}`}>{meta.label}</span>
      </div>

      <div className="drop__id">CASE #{String(drop.id).padStart(4, "0")}</div>

      <div className="drop__rubric" title={drop.rubric}>
        {drop.rubric}
      </div>

      {hasVerdict && drop.reasoning && (
        <div className="reason">
          <span className="label">Validator reasoning</span>
          {drop.reasoning}
        </div>
      )}

      <div className="drop__meta">
        <span className="drop__escrow">
          escrow <b>{weiToGen(drop.escrow_amount)} GEN</b>
        </span>
        {drop.outcome === "released" && (
          <span>paid {weiToGen(drop.paid_amount)} GEN</span>
        )}
        {drop.status === "open" && <span>expires {fmtDateTime(drop.expiration_ts)}</span>}
      </div>

      <details className="drop__details">
        <summary
          className="label"
          style={{ cursor: "pointer", userSelect: "none", listStyle: "revert" }}
        >
          Case detail
        </summary>
        <div style={{ marginTop: 12 }} className="stack-sm">
          <Row k="Poster" v={<Addr a={drop.poster} />} />
          <Row k="Source" v={isZero(drop.source) ? <span className="muted">unassigned</span> : <Addr a={drop.source} />} />
          <Row k="Fee (bps)" v={`${drop.fee_bps} (${weiToGen(fee.toString())} GEN)`} />
          {drop.confidence > 0 && <Row k="Confidence" v={`${drop.confidence}/100`} />}
          {drop.submitted_at > 0 && <Row k="Submitted" v={fmtDateTime(drop.submitted_at)} />}
          {drop.adjudicated_at > 0 && <Row k="Adjudicated" v={fmtDateTime(drop.adjudicated_at)} />}
          {drop.settle_after_ts > 0 && drop.status === "adjudicated" && (
            <Row k="Settle after" v={fmtDateTime(drop.settle_after_ts)} />
          )}
          {drop.evidence_package && (
            <div>
              <div className="label" style={{ marginBottom: 4 }}>
                Evidence package
              </div>
              <div className="muted" style={{ fontSize: 13, lineHeight: 1.55 }}>
                {drop.evidence_package}
              </div>
            </div>
          )}
          {drop.content_hash && (
            <Row k="Content hash" v={<code className="inline-code">{drop.content_hash}</code>} />
          )}
          <div style={{ marginTop: 6 }}>
            <a href={contractUrl()} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>
              View contract on explorer <External size={12} style={{ display: "inline", verticalAlign: "-2px" }} />
            </a>
          </div>
        </div>
      </details>
    </article>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13 }}>
      <span className="label" style={{ flex: "none" }}>
        {k}
      </span>
      <span className="mono" style={{ textAlign: "right", color: "var(--bone)", wordBreak: "break-word" }}>
        {v}
      </span>
    </div>
  );
}

function Addr({ a }: { a: string }) {
  return (
    <a href={addressUrl(a)} target="_blank" rel="noreferrer" title={a}>
      {shortAddr(a)}
    </a>
  );
}
